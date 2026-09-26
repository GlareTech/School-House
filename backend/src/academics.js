import { Router } from "express";
import { z } from "zod";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { db, audit, enqueue } from "./db.js";
import { admin, permit } from "./auth.js";
import { config } from "./config.js";
import { HttpError } from "./domain.js";
import { lockRow } from "./provider.js";
import { featureEnabled } from "./features.js";
import { canTargetLibrary, libraryWhereForStaff } from "./scope-domain.js";

const id = z.string().min(1).max(100);
const dt = z.string().datetime();
const has = (req, permission) =>
  req.user.role === "ADMIN" ||
  req.user.staffRole?.grants.some((g) => g.permission === permission);
const groupsOf = (rows, key) =>
  rows.reduce(
    (map, row) => map.set(row[key], [...(map.get(row[key]) || []), row]),
    new Map(),
  );
async function ownsCourse(req, classSubjectId) {
  if (req.user.role === "ADMIN") return true;
  return !!(await db.classSubject.findFirst({
    where: {
      id: classSubjectId,
      OR: [
        { teacherId: req.user.id },
        { class: { staff: { some: { staffId: req.user.id } } } },
      ],
    },
  }));
}
async function staffTeachingScope(req) {
  if (req.user.role === "ADMIN") return null;
  const [rows, led] = await Promise.all([
      db.staffClass.findMany({
        where: { staffId: req.user.id },
        select: { classId: true },
      }),
      db.class.findMany({
        where: { classTeacherId: req.user.id },
        select: { id: true },
      }),
    ]),
    classWideIds = [
      ...new Set([...rows.map((x) => x.classId), ...led.map((x) => x.id)]),
    ];
  const courses = await db.classSubject.findMany({
    where: {
      OR: [
        { teacherId: req.user.id },
        ...(classWideIds.length ? [{ classId: { in: classWideIds } }] : []),
      ],
    },
    select: { id: true, classId: true, subjectId: true, teacherId: true },
  });
  return { classWideIds, courses };
}
async function assignedClassIds(req) {
  const scope = await staffTeachingScope(req);
  return scope
    ? [
        ...new Set([
          ...scope.classWideIds,
          ...scope.courses.map((x) => x.classId),
        ]),
      ]
    : null;
}
async function classWideIds(req) {
  const scope = await staffTeachingScope(req);
  return scope?.classWideIds || null;
}
async function assertFiles(fileIds, actorId, purposes) {
  if (
    fileIds.length !==
    (await db.storedFile.count({
      where: {
        id: { in: [...new Set(fileIds)] },
        createdById: actorId,
        purpose: { in: purposes },
      },
    }))
  )
    throw new HttpError(400, "One or more uploaded files are invalid");
}
function requireCourse(req, classSubjectId) {
  return ownsCourse(req, classSubjectId).then((ok) => {
    if (!ok) throw new HttpError(403, "This course is not assigned to you");
  });
}
export function calculateSubject(grades, rubric) {
  const grouped = groupsOf(grades, "componentKey");
  return (
    Math.round(
      rubric.components.reduce((total, component) => {
        const entries = grouped.get(component.key) || [];
        const percent = entries.length
          ? entries.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) /
            entries.length
          : 0;
        return total + (percent * component.weight) / 100;
      }, 0) * 100,
    ) / 100
  );
}
const boundary = (score, scale) =>
  [...scale].sort((a, b) => b.min - a.min).find((x) => score >= x.min) || {
    grade: "F",
    remark: "Needs improvement",
  };
const reportTemplates = [
  "CLASSIC",
  "NURSERY_SKILLS",
  "TERM_PORTRAIT",
  "MIDTERM_COMPACT",
  "GRID_SHEET",
  "COLLEGE_TERM",
];
const reportDefaults = {
  templateKey: "CLASSIC",
  affectiveRatings: {},
  psychomotorRatings: {},
  reportMetadata: {},
  published: false,
  teacherComment: "",
  principalComment: "",
};

export async function reportFor(studentId, termId) {
  const [settings, student, term, grades, comment, ratings] = await Promise.all(
    [
      db.appSetting.findFirst(),
      db.user.findFirst({
        where: { id: studentId, role: "STUDENT" },
        include: { class: true },
      }),
      db.term.findUnique({ where: { id: termId }, include: { session: true } }),
      db.gradeEntry.findMany({
        where: { studentId, termId },
        include: {
          classSubject: {
            include: {
              subject: true,
              rubric: { include: { components: true } },
            },
          },
        },
      }),
      db.reportComment.findUnique({
        where: { studentId_termId: { studentId, termId } },
      }),
      db.studentRating.findMany({ where: { studentId, termId } }),
    ],
  );
  if (!student || !term) throw new HttpError(404, "Student or term not found");
  const courses = await db.classSubject.findMany({
    where: { classId: student.classId || "none" },
    include: { subject: true, rubric: { include: { components: true } } },
    orderBy: { subject: { name: "asc" } },
  });
  const scale = settings?.gradingScale || [];
  const byCourse = groupsOf(grades, "classSubjectId");
  const rows = courses.map((course) => {
    const entries = byCourse.get(course.id) || [];
    if (!course.rubric)
      return {
        classSubjectId: course.id,
        subjectId: course.subjectId,
        subject: course.subject.name,
        core: course.subject.core,
        total: 0,
        grade: "—",
        remark: "Rubric not configured",
        complete: false,
        entries: entries.map(
          ({ title, componentKey, score, maxScore, comment }) => ({
            title,
            componentKey,
            score,
            maxScore,
            comment,
          }),
        ),
      };
    const total = calculateSubject(entries, course.rubric),
      band = boundary(total, scale);
    const recorded = new Set(entries.map((x) => x.componentKey));
    return {
      classSubjectId: course.id,
      subjectId: course.subjectId,
      subject: course.subject.name,
      core: course.subject.core,
      total,
      grade: band.grade,
      remark: band.remark,
      complete: course.rubric.components.every((x) => recorded.has(x.key)),
      entries: entries.map(
        ({ title, componentKey, score, maxScore, comment }) => ({
          title,
          componentKey,
          score,
          maxScore,
          comment,
        }),
      ),
    };
  });
  const classStudentIds = (
    await db.user.findMany({
      where: { role: "STUDENT", classId: student.classId },
      select: { id: true },
    })
  ).map((x) => x.id);
  const peerGrades = await db.gradeEntry.findMany({
    where: { termId, studentId: { in: classStudentIds } },
    include: {
      classSubject: { include: { rubric: { include: { components: true } } } },
    },
  });
  for (const row of rows) {
    const totals = [
      ...groupsOf(
        peerGrades.filter((g) => g.classSubjectId === row.classSubjectId),
        "studentId",
      ).values(),
    ]
      .map((gs) =>
        gs[0].classSubject.rubric
          ? calculateSubject(gs, gs[0].classSubject.rubric)
          : 0,
      )
      .sort((a, b) => b - a);
    row.classAverage = totals.length
      ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) /
        100
      : 0;
    row.rank = totals.indexOf(row.total) + 1;
    row.classSize = totals.length;
  }
  const attendance = await db.attendance.findMany({
    where: { studentId, date: { gte: term.startsAt, lte: term.endsAt } },
  });
  const average = rows.length
    ? Math.round((rows.reduce((a, b) => a + b.total, 0) / rows.length) * 100) /
      100
    : 0;
  const band = boundary(average, scale);
  const peerAverages = classStudentIds
    .map((peerId) => {
      const totals = rows.map((row) => {
        const entries = peerGrades.filter(
          (g) =>
            g.studentId === peerId && g.classSubjectId === row.classSubjectId,
        );
        return entries.length && entries[0].classSubject.rubric
          ? calculateSubject(entries, entries[0].classSubject.rubric)
          : 0;
      });
      return totals.length
        ? Math.round(
            (totals.reduce((a, b) => a + b, 0) / totals.length) * 100,
          ) / 100
        : 0;
    })
    .sort((a, b) => b - a);
  const gradeAnalysis = rows.reduce(
    (out, row) => ((out[row.grade] = (out[row.grade] || 0) + 1), out),
    {},
  );
  const ratingByCategory = Object.fromEntries(
    ratings.map((x) => [x.category, x.ratings]),
  );
  const reportSettings = {
    ...reportDefaults,
    ...(comment || {}),
    affectiveRatings:
      ratingByCategory.AFFECTIVE || comment?.affectiveRatings || {},
    psychomotorRatings:
      ratingByCategory.PSYCHOMOTOR || comment?.psychomotorRatings || {},
  };
  return {
    student: {
      id: student.id,
      name: student.name,
      className: student.class?.name,
      profilePictureId: student.profilePictureId,
    },
    term: { id: term.id, name: term.name, session: term.session.name },
    subjects: rows,
    average,
    overallGrade: band.grade,
    overallRemark: band.remark,
    totalObtained:
      Math.round(rows.reduce((sum, row) => sum + row.total, 0) * 100) / 100,
    totalObtainable: rows.length * 100,
    position: peerAverages.indexOf(average) + 1,
    classSize: classStudentIds.length,
    gradeAnalysis,
    attendance: {
      present: attendance.filter((x) => x.status === "PRESENT").length,
      late: attendance.filter((x) => x.status === "LATE").length,
      absent: attendance.filter((x) => x.status === "ABSENT").length,
      total: attendance.length,
    },
    comments: {
      teacherComment: reportSettings.teacherComment,
      principalComment: reportSettings.principalComment,
    },
    reportSettings,
    ratings,
    school: settings,
  };
}

export function academicRouter() {
  const r = Router();
  r.get("/catalog", async (req, res) => {
    const staff = req.user.role !== "STUDENT";
    const teachingScope =
        req.user.role === "STAFF" ? await staffTeachingScope(req) : null,
      scopedClasses = teachingScope
        ? [
            ...new Set([
              ...teachingScope.classWideIds,
              ...teachingScope.courses.map((x) => x.classId),
            ]),
          ]
        : null;
    const courseWhere =
      req.user.role === "ADMIN"
        ? {}
        : req.user.role === "STAFF"
          ? { id: { in: teachingScope.courses.map((x) => x.id) } }
          : { classId: req.user.classId || "none" };
    const courses = await db.classSubject.findMany({
      where: courseWhere,
      include: {
        class: true,
        subject: true,
        teacher: { select: { id: true, name: true } },
        rubric: { include: { components: true } },
      },
      orderBy: { subject: { name: "asc" } },
    });
    const subjectWhere =
      req.user.role === "STAFF"
        ? { id: { in: [...new Set(courses.map((x) => x.subjectId))] } }
        : req.user.role === "STUDENT"
          ? { classSubjects: { some: { classId: req.user.classId || "none" } } }
          : {};
    res.json({
      sessions: await db.academicSession.findMany({
        include: { terms: true },
        orderBy: { startsAt: "desc" },
      }),
      subjects: await db.subject.findMany({
        where: subjectWhere,
        orderBy: { name: "asc" },
      }),
      courses,
      students: staff
        ? await db.user.findMany({
            where: {
              role: "STUDENT",
              ...(scopedClasses ? { classId: { in: scopedClasses } } : {}),
            },
            select: {
              id: true,
              name: true,
              classId: true,
              profilePictureId: true,
            },
            orderBy: { name: "asc" },
            take: 500,
          })
        : undefined,
      teachers: staff
        ? await db.user.findMany({
            where: { role: "STAFF", active: true },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
          })
        : undefined,
    });
  });
  r.post("/sessions", permit("SETTINGS_MANAGE"), async (req, res) => {
    const x = z
      .object({
        name: z.string().trim().min(1).max(100),
        startsAt: dt,
        endsAt: dt,
        terms: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(50),
              position: z.number().int().min(1).max(20),
              startsAt: dt,
              endsAt: dt,
            }),
          )
          .min(1)
          .max(12),
      })
      .refine(
        (v) => new Date(v.endsAt) > new Date(v.startsAt),
        "End date must follow start date",
      )
      .parse(req.body);
    const row = await db.academicSession.create({
      data: {
        name: x.name,
        startsAt: x.startsAt,
        endsAt: x.endsAt,
        terms: { create: x.terms },
      },
      include: { terms: true },
    });
    await audit(db, req.user.id, "session.create", row.id);
    res.status(201).json(row);
  });
  r.patch("/sessions/:id", permit("SETTINGS_MANAGE"), async (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        startsAt: dt,
        endsAt: dt,
      })
      .refine(
        (v) => new Date(v.endsAt) > new Date(v.startsAt),
        "End date must follow start date",
      )
      .parse(req.body);
    const row = await db.academicSession.update({
      where: { id: req.params.id },
      data,
    });
    await audit(db, req.user.id, "session.update", row.id);
    res.json(row);
  });
  r.delete("/sessions/:id", permit("SETTINGS_MANAGE"), async (req, res) => {
    const session = await db.academicSession.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { promotionRuns: true } } },
    });
    if (!session) throw new HttpError(404, "Session not found");
    const termIds = (
      await db.term.findMany({
        where: { sessionId: session.id },
        select: { id: true },
      })
    ).map((x) => x.id);
    const used = termIds.length
      ? await db.gradeEntry.count({ where: { termId: { in: termIds } } })
      : 0;
    if (used || session._count.promotionRuns)
      throw new HttpError(
        409,
        "This session has grades or promotion history and cannot be deleted",
      );
    await db.academicSession.delete({ where: { id: session.id } });
    await audit(db, req.user.id, "session.delete", session.id);
    res.json({ ok: true });
  });
  r.post("/subjects", permit("SETTINGS_MANAGE"), async (req, res) => {
    const data = z
      .object({
        code: z
          .string()
          .trim()
          .min(1)
          .max(20)
          .transform((s) => s.toUpperCase()),
        codes: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(20)
              .transform((s) => s.toUpperCase()),
          )
          .min(1)
          .max(20)
          .optional(),
        name: z.string().trim().min(1).max(100),
        core: z.boolean().default(false),
      })
      .parse(req.body);
    const codes = [...new Set(data.codes || [data.code])];
    if (!codes.includes(data.code)) codes.unshift(data.code);
    res.status(201).json(await db.subject.create({ data: { ...data, codes } }));
  });
  r.patch("/subjects/:id", permit("SETTINGS_MANAGE"), async (req, res) => {
    if (req.user.role !== "ADMIN")
      throw new HttpError(
        403,
        "Only administrators can edit the subject catalogue",
      );
    const data = z
      .object({
        code: z
          .string()
          .trim()
          .min(1)
          .max(20)
          .transform((s) => s.toUpperCase()),
        codes: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(20)
              .transform((s) => s.toUpperCase()),
          )
          .min(1)
          .max(20),
        name: z.string().trim().min(1).max(100),
        core: z.boolean(),
      })
      .strict()
      .parse(req.body);
    const codes = [...new Set(data.codes)];
    if (!codes.includes(data.code)) codes.unshift(data.code);
    const row = await db.subject.update({
      where: { id: req.params.id },
      data: { ...data, codes },
    });
    await audit(db, req.user.id, "subject.update", row.id);
    res.json(row);
  });
  r.delete("/subjects/:id", permit("SETTINGS_MANAGE"), async (req, res) => {
    if (req.user.role !== "ADMIN")
      throw new HttpError(403, "Only administrators can delete subjects");
    if (await db.classSubject.count({ where: { subjectId: req.params.id } }))
      throw new HttpError(
        409,
        "Remove this subject from all class courses before deleting it",
      );
    await db.subject.delete({ where: { id: req.params.id } });
    await audit(db, req.user.id, "subject.delete", req.params.id);
    res.json({ ok: true });
  });
  r.delete("/courses/:id", permit("SETTINGS_MANAGE"), async (req, res) => {
    if (req.user.role !== "ADMIN")
      throw new HttpError(403, "Only administrators can delete courses");
    const used = await db.gradeEntry.count({
      where: { classSubjectId: req.params.id },
    });
    if (used)
      throw new HttpError(409, "This course has grades and cannot be deleted");
    await db.classSubject.delete({ where: { id: req.params.id } });
    await audit(db, req.user.id, "course.delete", req.params.id);
    res.json({ ok: true });
  });
  r.post("/courses", permit("SETTINGS_MANAGE"), async (req, res) => {
    const data = z
      .object({
        classId: id,
        subjectId: id,
        teacherId: id.nullable().default(null),
      })
      .parse(req.body);
    if (
      data.teacherId &&
      !(await db.user.findFirst({
        where: { id: data.teacherId, role: "STAFF", active: true },
      }))
    )
      throw new HttpError(400, "Choose an active staff member as teacher");
    res.status(201).json(await db.classSubject.create({ data }));
  });
  r.patch("/courses/:id", permit("SETTINGS_MANAGE"), async (req, res) => {
    const { teacherId } = z
      .object({ teacherId: id.nullable() })
      .parse(req.body);
    if (
      teacherId &&
      !(await db.user.findFirst({
        where: { id: teacherId, role: "STAFF", active: true },
      }))
    )
      throw new HttpError(400, "Choose an active staff member as teacher");
    const course = await db.classSubject.findUnique({
      where: { id: req.params.id },
    });
    if (!course) throw new HttpError(404, "Course not found");
    if (
      !teacherId &&
      (await db.exam.count({
        where: {
          classId: course.classId,
          subjectId: course.subjectId,
          status: { not: "DRAFT" },
        },
      }))
    )
      throw new HttpError(
        409,
        "A published CBT uses this course. Assign a replacement teacher instead of removing the teacher.",
      );
    const row = await db.$transaction(async (tx) => {
      const saved = await tx.classSubject.update({
        where: { id: req.params.id },
        data: { teacherId },
      });
      await audit(tx, req.user.id, "course.teacher", saved.id);
      return saved;
    });
    res.json(row);
  });
  r.put("/courses/:id/rubric", permit("GRADES_MANAGE"), async (req, res) => {
    await requireCourse(req, req.params.id);
    const { components } = z
      .object({
        components: z
          .array(
            z.object({
              key: z.string().regex(/^[A-Z0-9_]{2,30}$/),
              label: z.string().trim().min(1).max(100),
              weight: z.number().int().min(1).max(100),
            }),
          )
          .min(1)
          .max(20)
          .refine(
            (a) => a.reduce((n, x) => n + x.weight, 0) === 100,
            "Weights must total 100",
          ),
      })
      .parse(req.body);
    if (await db.gradeEntry.count({ where: { classSubjectId: req.params.id } }))
      throw new HttpError(
        409,
        "This rubric has recorded grades and is locked to preserve report history",
      );
    res.json(
      await db.$transaction(async (tx) => {
        await tx.courseRubric.deleteMany({
          where: { classSubjectId: req.params.id },
        });
        const rubric = await tx.courseRubric.create({
          data: {
            classSubjectId: req.params.id,
            components: { create: components },
          },
          include: { components: true },
        });
        await audit(tx, req.user.id, "rubric.update", rubric.id);
        return rubric;
      }),
    );
  });
  r.get("/assignments", async (req, res) =>
    res.json(
      await db.assignment.findMany({
        where:
          req.user.role === "STUDENT"
            ? {
                published: true,
                releaseAt: { lte: new Date() },
                classSubject: { classId: req.user.classId || "none" },
              }
            : req.user.role === "STAFF"
              ? {
                  classSubject: {
                    OR: [
                      { teacherId: req.user.id },
                      { class: { staff: { some: { staffId: req.user.id } } } },
                    ],
                  },
                }
              : {},
        include: {
          classSubject: { include: { class: true, subject: true } },
          attachments: { include: { file: true } },
          submissions:
            req.user.role === "STUDENT"
              ? {
                  where: { studentId: req.user.id },
                  include: { files: { include: { file: true } } },
                }
              : {
                  include: {
                    student: { select: { name: true } },
                    files: { include: { file: true } },
                  },
                },
        },
        orderBy: { dueAt: "desc" },
        take: 500,
      }),
    ),
  );
  r.post("/assignments", permit("ASSIGNMENTS_MANAGE"), async (req, res) => {
    const x = z
      .object({
        classSubjectId: id,
        termId: id,
        title: z.string().trim().min(1).max(200),
        instructions: z.string().max(20000),
        releaseAt: dt,
        dueAt: dt,
        maxScore: z.number().int().positive().max(10000),
        published: z.boolean(),
        fileIds: z.array(id).max(10).default([]),
      })
      .refine(
        (v) => new Date(v.dueAt) > new Date(v.releaseAt),
        "Due date must follow release date",
      )
      .parse(req.body);
    await requireCourse(req, x.classSubjectId);
    const { fileIds, ...data } = x;
    await assertFiles(fileIds, req.user.id, ["assignment"]);
    const row = await db.assignment.create({
      data: {
        ...data,
        createdById: req.user.id,
        attachments: { create: fileIds.map((fileId) => ({ fileId })) },
      },
    });
    res.status(201).json(row);
  });
  r.post("/assignments/:id/submit", async (req, res) => {
    if (req.user.role !== "STUDENT")
      throw new HttpError(403, "Student access required");
    const x = z
      .object({
        text: z.string().max(30000),
        fileIds: z.array(id).max(10).default([]),
      })
      .parse(req.body);
    const a = await db.assignment.findFirst({
      where: {
        id: req.params.id,
        published: true,
        releaseAt: { lte: new Date() },
        classSubject: { classId: req.user.classId || "none" },
      },
    });
    if (!a || new Date() > a.dueAt)
      throw new HttpError(409, "Assignment is unavailable or overdue");
    await assertFiles(x.fileIds, req.user.id, ["submission"]);
    const existing = await db.assignmentSubmission.findUnique({
      where: {
        assignmentId_studentId: { assignmentId: a.id, studentId: req.user.id },
      },
    });
    const row = await db.$transaction(async (tx) => {
      if (existing) {
        await tx.submissionFile.deleteMany({
          where: { submissionId: existing.id },
        });
        await tx.gradeEntry.deleteMany({
          where: {
            studentId: req.user.id,
            classSubjectId: a.classSubjectId,
            termId: a.termId,
            componentKey: "ASSIGNMENT",
            title: a.title,
          },
        });
        return tx.assignmentSubmission.update({
          where: { id: existing.id },
          data: {
            text: x.text,
            submittedAt: new Date(),
            score: null,
            feedback: "",
            gradedAt: null,
            gradedById: null,
            files: { create: x.fileIds.map((fileId) => ({ fileId })) },
          },
        });
      }
      return tx.assignmentSubmission.create({
        data: {
          assignmentId: a.id,
          studentId: req.user.id,
          text: x.text,
          files: { create: x.fileIds.map((fileId) => ({ fileId })) },
        },
      });
    });
    res.json(row);
  });
  r.patch(
    "/submissions/:id/grade",
    permit("GRADES_MANAGE"),
    async (req, res) => {
      const x = z
        .object({
          score: z.number().int().min(0),
          feedback: z.string().max(10000),
        })
        .parse(req.body);
      const s = await db.assignmentSubmission.findUnique({
        where: { id: req.params.id },
        include: { assignment: true },
      });
      if (!s) throw new HttpError(404, "Submission not found");
      await requireCourse(req, s.assignment.classSubjectId);
      if (x.score > s.assignment.maxScore)
        throw new HttpError(400, "Score exceeds maximum");
      const row = await db.$transaction(async (tx) => {
        const saved = await tx.assignmentSubmission.update({
          where: { id: s.id },
          data: { ...x, gradedAt: new Date(), gradedById: req.user.id },
        });
        await tx.gradeEntry.upsert({
          where: {
            studentId_classSubjectId_termId_componentKey_title: {
              studentId: s.studentId,
              classSubjectId: s.assignment.classSubjectId,
              termId: s.assignment.termId,
              componentKey: "ASSIGNMENT",
              title: s.assignment.title,
            },
          },
          create: {
            studentId: s.studentId,
            classSubjectId: s.assignment.classSubjectId,
            termId: s.assignment.termId,
            componentKey: "ASSIGNMENT",
            title: s.assignment.title,
            score: x.score,
            maxScore: s.assignment.maxScore,
            comment: x.feedback,
            teacherId: req.user.id,
          },
          update: {
            score: x.score,
            maxScore: s.assignment.maxScore,
            comment: x.feedback,
            teacherId: req.user.id,
          },
        });
        await enqueue(tx, "assignment.graded", saved.id, saved);
        await audit(tx, req.user.id, "assignment.grade", saved.id);
        return saved;
      });
      res.json(row);
    },
  );
  r.post("/materials", permit("MATERIALS_MANAGE"), async (req, res) => {
    const data = z
      .object({
        classSubjectId: id,
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000),
        fileId: id,
      })
      .parse(req.body);
    await requireCourse(req, data.classSubjectId);
    await assertFiles([data.fileId], req.user.id, ["material"]);
    res.status(201).json(await db.studyMaterial.create({ data }));
  });
  r.get("/materials", async (req, res) =>
    res.json(
      await db.studyMaterial.findMany({
        where:
          req.user.role === "STUDENT"
            ? { classSubject: { classId: req.user.classId || "none" } }
            : req.user.role === "STAFF"
              ? {
                  classSubject: {
                    OR: [
                      { teacherId: req.user.id },
                      { class: { staff: { some: { staffId: req.user.id } } } },
                    ],
                  },
                }
              : {},
        include: {
          classSubject: { include: { subject: true, class: true } },
          file: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );
  r.get("/attendance/self", async (req, res) => {
    if (req.user.role !== "STUDENT")
      throw new HttpError(403, "Student access required");
    const date = z
        .string()
        .date()
        .default(new Date().toISOString().slice(0, 10))
        .parse(req.query.date),
      window = await db.attendanceWindow.findUnique({
        where: {
          classId_date: {
            classId: req.user.classId || "none",
            date: new Date(date),
          },
        },
        include: { class: { select: { name: true } } },
      }),
      record = await db.attendance.findUnique({
        where: {
          studentId_date: { studentId: req.user.id, date: new Date(date) },
        },
      });
    res.json({
      window: window
        ? {
            ...window,
            accepting: window.status === "OPEN" && window.closesAt > new Date(),
          }
        : null,
      record,
    });
  });
  r.post("/attendance/self", async (req, res) => {
    if (req.user.role !== "STUDENT")
      throw new HttpError(403, "Student access required");
    const input = z
        .object({
          date: z.string().date(),
          status: z.enum(["PRESENT", "LATE"]),
        })
        .parse(req.body),
      window = await db.attendanceWindow.findUnique({
        where: {
          classId_date: {
            classId: req.user.classId || "none",
            date: new Date(input.date),
          },
        },
      });
    if (!window || window.status !== "OPEN" || window.closesAt <= new Date())
      throw new HttpError(409, "Attendance marking is not open for your class");
    const row = await db.attendance.upsert({
      where: {
        studentId_date: { studentId: req.user.id, date: new Date(input.date) },
      },
      create: {
        studentId: req.user.id,
        date: new Date(input.date),
        status: input.status,
        source: "STUDENT",
        reviewStatus: "PENDING",
      },
      update: {
        status: input.status,
        source: "STUDENT",
        reviewStatus: "PENDING",
      },
    });
    await audit(db, req.user.id, "attendance.selfMark", row.id);
    res.json(row);
  });
  r.get("/library", async (req, res) => {
    let where = {};
    if (req.user.role === "STUDENT")
      where = {
        published: true,
        OR: [
          { classId: null, subjectId: null },
          { classId: req.user.classId || "none" },
          {
            subject: {
              classSubjects: { some: { classId: req.user.classId || "none" } },
            },
          },
        ],
      };
    if (req.user.role === "STAFF")
      where = libraryWhereForStaff(req.user.id, await staffTeachingScope(req));
    res.json(
      await db.libraryMaterial.findMany({
        where,
        include: {
          file: true,
          class: true,
          subject: true,
          uploadedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    );
  });
  r.post("/library", permit("LIBRARY_MANAGE"), async (req, res) => {
    const data = z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).default(""),
        author: z.string().trim().max(150).default(""),
        category: z.string().trim().max(100).default(""),
        fileId: id,
        classId: id.nullable().default(null),
        subjectId: id.nullable().default(null),
        published: z.boolean().default(true),
      })
      .parse(req.body);
    await assertFiles([data.fileId], req.user.id, ["library"]);
    if (req.user.role === "STAFF") {
      if (!data.classId && !data.subjectId)
        throw new HttpError(
          403,
          "Teachers must assign library material to an assigned class or subject",
        );
      if (
        !canTargetLibrary(
          await staffTeachingScope(req),
          data.classId,
          data.subjectId,
        )
      )
        throw new HttpError(
          403,
          "This class and subject combination is not assigned to you",
        );
    }
    const row = await db.$transaction(async (tx) => {
      const saved = await tx.libraryMaterial.create({
        data: { ...data, uploadedById: req.user.id },
      });
      await audit(tx, req.user.id, "library.upload", saved.id);
      return saved;
    });
    res.status(201).json(row);
  });
  r.post("/grades", permit("GRADES_MANAGE"), async (req, res) => {
    const x = z
      .object({
        studentId: id,
        classSubjectId: id,
        termId: id,
        componentKey: z.string().regex(/^[A-Z0-9_]{2,30}$/),
        title: z.string().trim().min(1).max(100),
        score: z.number().int().min(0),
        maxScore: z.number().int().positive().max(10000),
        comment: z.string().max(1000).default(""),
      })
      .refine((v) => v.score <= v.maxScore, "Score exceeds maximum")
      .parse(req.body);
    await requireCourse(req, x.classSubjectId);
    if (
      !(await db.classSubject.findFirst({
        where: {
          id: x.classSubjectId,
          class: { students: { some: { id: x.studentId } } },
        },
      }))
    )
      throw new HttpError(400, "Student is not enrolled in this course class");
    const row = await db.$transaction(async (tx) => {
      const saved = await tx.gradeEntry.upsert({
        where: {
          studentId_classSubjectId_termId_componentKey_title: {
            studentId: x.studentId,
            classSubjectId: x.classSubjectId,
            termId: x.termId,
            componentKey: x.componentKey,
            title: x.title,
          },
        },
        create: { ...x, teacherId: req.user.id },
        update: {
          score: x.score,
          maxScore: x.maxScore,
          comment: x.comment,
          teacherId: req.user.id,
        },
      });
      await audit(tx, req.user.id, "grade.update", saved.id);
      return saved;
    });
    res.json(row);
  });
  r.get("/overall-grades", permit("GRADES_MANAGE"), async (req, res) => {
    const query = z
      .object({ termId: id, classId: id.optional() })
      .parse(req.query);
    const staffClasses =
      req.user.role === "STAFF" ? await assignedClassIds(req) : null;
    const wide = req.user.role === "STAFF" ? await classWideIds(req) : null;
    const teacherCourses =
      req.user.role === "STAFF"
        ? await db.classSubject.findMany({
            where: { teacherId: req.user.id },
            select: { id: true, classId: true },
          })
        : [];
    if (query.classId && staffClasses && !staffClasses.includes(query.classId))
      throw new HttpError(403, "This class is not assigned to you");
    const studentWhere = {
      role: "STUDENT",
      ...(query.classId
        ? { classId: query.classId }
        : staffClasses
          ? { classId: { in: staffClasses } }
          : {}),
    };
    const students = await db.user.findMany({
      where: studentWhere,
      select: {
        id: true,
        name: true,
        classId: true,
        class: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      take: 5000,
    });
    const classIds = [
      ...new Set(students.map((s) => s.classId).filter(Boolean)),
    ];
    const courses = await db.classSubject.findMany({
      where: {
        classId: { in: classIds },
        ...(wide
          ? {
              OR: [
                { classId: { in: wide } },
                { id: { in: teacherCourses.map((x) => x.id) } },
              ],
            }
          : {}),
      },
      include: { subject: true, rubric: { include: { components: true } } },
    });
    const grades =
      students.length && courses.length
        ? await db.gradeEntry.findMany({
            where: {
              termId: query.termId,
              studentId: { in: students.map((s) => s.id) },
              classSubjectId: { in: courses.map((c) => c.id) },
            },
            include: {
              classSubject: {
                include: {
                  subject: true,
                  rubric: { include: { components: true } },
                },
              },
            },
          })
        : [];
    const scale =
      (await db.appSetting.findFirst({ select: { gradingScale: true } }))
        ?.gradingScale || [];
    const byStudent = groupsOf(grades, "studentId");
    res.json(
      students.map((student) => {
        const entries = byStudent.get(student.id) || [],
          entryGroups = groupsOf(entries, "classSubjectId"),
          subjects = courses
            .filter((c) => c.classId === student.classId)
            .flatMap((course) => {
              const rows = entryGroups.get(course.id) || [];
              if (!course.rubric) return [];
              const total = calculateSubject(rows, course.rubric),
                band = boundary(total, scale);
              const recorded = new Set(rows.map((x) => x.componentKey));
              return [
                {
                  subject: course.subject.name,
                  total,
                  grade: band.grade,
                  components: rows.length,
                  complete: course.rubric.components.every((x) =>
                    recorded.has(x.key),
                  ),
                },
              ];
            });
        const average = subjects.length
            ? Math.round(
                (subjects.reduce((sum, row) => sum + row.total, 0) /
                  subjects.length) *
                  100,
              ) / 100
            : 0,
          band = boundary(average, scale);
        return {
          studentId: student.id,
          name: student.name,
          classId: student.classId,
          className: student.class?.name || "",
          subjects,
          average,
          overallGrade: band.grade,
          overallRemark: band.remark,
          gradeEntries: entries.length,
        };
      }),
    );
  });
  const ratingValues = z.record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,50}$/),
    z.number().int().min(1).max(5),
  );
  r.get("/ratings", async (req, res) => {
    const query = z.object({ studentId: id, termId: id }).parse(req.query);
    if (req.user.role === "STUDENT" && query.studentId !== req.user.id)
      throw new HttpError(403, "Personal ratings only");
    if (req.user.role === "STAFF") {
      if (!has(req, "RATINGS_MANAGE") && !has(req, "REPORTS_VIEW"))
        throw new HttpError(403, "Student rating access required");
      const student = await db.user.findUnique({
          where: { id: query.studentId },
          select: { classId: true },
        }),
        wide = await classWideIds(req);
      if (!student || !wide.includes(student.classId))
        throw new HttpError(403, "Student is outside your assigned classes");
    }
    res.json(
      await db.studentRating.findMany({
        where: { studentId: query.studentId, termId: query.termId },
        include: { ratedBy: { select: { name: true } } },
      }),
    );
  });
  r.put(
    "/ratings/:studentId/:termId",
    permit("RATINGS_MANAGE"),
    async (req, res) => {
      const input = z
          .object({
            categories: z
              .array(
                z.object({
                  category: z.enum([
                    "AFFECTIVE",
                    "PSYCHOMOTOR",
                    "EXTRA_CURRICULAR",
                  ]),
                  ratings: ratingValues,
                  comment: z.string().max(2000).default(""),
                }),
              )
              .min(1)
              .max(3),
          })
          .parse(req.body),
        student = await db.user.findFirst({
          where: { id: req.params.studentId, role: "STUDENT" },
          select: { classId: true },
        });
      if (!student) throw new HttpError(404, "Student not found");
      const wide = await classWideIds(req);
      if (wide && !wide.includes(student.classId))
        throw new HttpError(403, "Student ratings require an assigned class");
      const saved = [];
      for (const item of input.categories)
        saved.push(
          await db.studentRating.upsert({
            where: {
              studentId_termId_category: {
                studentId: req.params.studentId,
                termId: req.params.termId,
                category: item.category,
              },
            },
            create: {
              ...item,
              studentId: req.params.studentId,
              termId: req.params.termId,
              ratedById: req.user.id,
            },
            update: {
              ratings: item.ratings,
              comment: item.comment,
              ratedById: req.user.id,
            },
          }),
        );
      await audit(
        db,
        req.user.id,
        "studentRating.update",
        req.params.studentId,
      );
      res.json(saved);
    },
  );
  r.get(
    "/reports/class/:classId/:termId",
    permit("REPORTS_VIEW"),
    async (req, res) => {
      const wide = await classWideIds(req);
      if (wide && !wide.includes(req.params.classId))
        throw new HttpError(403, "Class reports require an assigned class");
      const students = await db.user.findMany({
        where: { role: "STUDENT", active: true, classId: req.params.classId },
        select: { id: true },
        orderBy: { name: "asc" },
        take: 200,
      });
      res.json(
        await Promise.all(
          students.map((s) => reportFor(s.id, req.params.termId)),
        ),
      );
    },
  );
  r.post(
    "/reports/class/:classId/:termId",
    permit("REPORTS_VIEW"),
    async (req, res) => {
      const { templateKey } = z
          .object({ templateKey: z.enum(reportTemplates) })
          .parse(req.body),
        wide = await classWideIds(req);
      if (wide && !wide.includes(req.params.classId))
        throw new HttpError(403, "Class reports require an assigned class");
      const students = await db.user.findMany({
        where: { role: "STUDENT", active: true, classId: req.params.classId },
        select: { id: true },
        orderBy: { name: "asc" },
        take: 200,
      });
      for (const student of students)
        await db.reportComment.upsert({
          where: {
            studentId_termId: {
              studentId: student.id,
              termId: req.params.termId,
            },
          },
          create: {
            ...reportDefaults,
            studentId: student.id,
            termId: req.params.termId,
            templateKey,
            authorId: req.user.id,
          },
          update: { templateKey, authorId: req.user.id },
        });
      await audit(
        db,
        req.user.id,
        "reportCard.classGenerate",
        req.params.classId,
      );
      res.json(
        await Promise.all(
          students.map((s) => reportFor(s.id, req.params.termId)),
        ),
      );
    },
  );
  r.get("/reports/:studentId/:termId", async (req, res) => {
    if (req.user.role === "STUDENT" && req.params.studentId !== req.user.id)
      throw new HttpError(403, "Personal report only");
    if (req.user.role === "STAFF" && !has(req, "REPORTS_VIEW"))
      throw new HttpError(403, "Report access required");
    if (req.user.role === "STAFF") {
      const student = await db.user.findUnique({
          where: { id: req.params.studentId },
          select: { classId: true },
        }),
        wide = await classWideIds(req);
      if (!student || !wide.includes(student.classId))
        throw new HttpError(403, "Student is outside your assigned classes");
    }
    res.json(await reportFor(req.params.studentId, req.params.termId));
  });
  const ratingRecord = z.record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,50}$/),
    z.number().int().min(1).max(5),
  );
  const reportSettingInput = z
    .object({
      teacherComment: z.string().max(2000).optional(),
      principalComment: z.string().max(2000).optional(),
      templateKey: z.enum(reportTemplates).optional(),
      affectiveRatings: ratingRecord.optional(),
      psychomotorRatings: ratingRecord.optional(),
      reportMetadata: z
        .object({
          admissionNumber: z.string().max(60).optional(),
          gender: z.string().max(30).optional(),
          dateOfBirth: z.string().max(30).optional(),
          age: z.string().max(30).optional(),
          house: z.string().max(80).optional(),
          clubSociety: z.string().max(120).optional(),
          heightCm: z.string().max(20).optional(),
          weightKg: z.string().max(20).optional(),
          nextTermBegins: z.string().max(40).optional(),
          promotionStatus: z.string().max(100).optional(),
          teacherName: z.string().max(150).optional(),
        })
        .strict()
        .optional(),
      published: z.boolean().optional(),
    })
    .strict();
  r.put(
    "/reports/:studentId/:termId/comments",
    permit("REPORTS_VIEW"),
    async (req, res) => {
      const data = reportSettingInput.parse(req.body),
        student = await db.user.findFirst({
          where: { id: req.params.studentId, role: "STUDENT" },
          select: { classId: true },
        });
      if (!student) throw new HttpError(404, "Student not found");
      if (
        req.user.role === "STAFF" &&
        !(await classWideIds(req)).includes(student.classId)
      )
        throw new HttpError(403, "Student is outside your assigned classes");
      const row = await db.reportComment.upsert({
        where: {
          studentId_termId: {
            studentId: req.params.studentId,
            termId: req.params.termId,
          },
        },
        create: {
          ...reportDefaults,
          ...data,
          studentId: req.params.studentId,
          termId: req.params.termId,
          authorId: req.user.id,
        },
        update: { ...data, authorId: req.user.id },
      });
      await audit(db, req.user.id, "reportCard.configure", row.id);
      res.json(row);
    },
  );
  const narrativeRow = z.object({
    curriculumArea: z.string().trim().min(1).max(150),
    learningArea: z.string().trim().max(150).default(""),
    progress: z.string().trim().max(3000).default(""),
    attainment: z.string().trim().max(3000).default(""),
    effort: z.string().trim().max(3000).default(""),
    target: z.string().trim().max(3000).default(""),
    comments: z.string().trim().max(3000).default(""),
  });
  const rating = z.enum([
    "EXCELLENT",
    "GOOD",
    "SATISFACTORY",
    "DEVELOPING",
    "POOR",
    "NOT_RATED",
  ]);
  const progressInput = z
    .object({
      studentId: id,
      termId: id,
      reportType: z.enum(["MID_TERM", "END_TERM"]),
      title: z.string().trim().min(1).max(200),
      rows: z.array(narrativeRow).min(1).max(40),
      traits: z.object({
        attitudeToLearning: rating,
        behaviour: rating,
        relationshipWithAdults: rating,
        relationshipWithChildren: rating,
      }),
      teacherComment: z.string().trim().max(3000).default(""),
      administratorComment: z.string().trim().max(3000).default(""),
      signedBy: z.string().trim().max(150).default(""),
      reportDate: z.string().date(),
      status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
    })
    .strict();
  r.get("/progress-reports", async (req, res) => {
    let where = {};
    if (req.user.role === "STUDENT")
      where = { studentId: req.user.id, status: "PUBLISHED" };
    if (req.user.role === "STAFF") {
      if (!has(req, "REPORTS_VIEW"))
        throw new HttpError(403, "Report access required");
      const classIds = await classWideIds(req);
      where = { student: { classId: { in: classIds } } };
    }
    res.json(
      await db.progressReport.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              classId: true,
              class: { select: { name: true } },
            },
          },
          term: { include: { session: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: [{ reportDate: "desc" }, { updatedAt: "desc" }],
        take: 200,
      }),
    );
  });
  r.post("/progress-reports", permit("REPORTS_VIEW"), async (req, res) => {
    const x = progressInput.parse(req.body),
      student = await db.user.findFirst({
        where: { id: x.studentId, role: "STUDENT" },
        select: { id: true, classId: true },
      });
    if (!student) throw new HttpError(400, "Choose a valid student");
    if (
      req.user.role === "STAFF" &&
      !(await classWideIds(req)).includes(student.classId)
    )
      throw new HttpError(403, "Progress reports require an assigned class");
    const { reportDate, ...data } = x;
    const row = await db.$transaction(async (tx) => {
      const saved = await tx.progressReport.upsert({
        where: {
          studentId_termId_reportType: {
            studentId: x.studentId,
            termId: x.termId,
            reportType: x.reportType,
          },
        },
        create: {
          ...data,
          reportDate: new Date(reportDate),
          createdById: req.user.id,
        },
        update: {
          ...data,
          reportDate: new Date(reportDate),
          createdById: req.user.id,
        },
      });
      await audit(tx, req.user.id, "progressReport.update", saved.id);
      if (saved.status === "PUBLISHED")
        await enqueue(tx, "progressReport.published", saved.id, {
          id: saved.id,
          studentId: saved.studentId,
          termId: saved.termId,
          reportType: saved.reportType,
        });
      return saved;
    });
    res.json(row);
  });
  r.put("/promotion-rules", permit("PROMOTIONS_MANAGE"), async (req, res) => {
    const data = z
      .object({
        sessionId: id,
        sourceClassId: id,
        targetClassId: id,
        minimumAverage: z.number().int().min(0).max(100),
        coreSubjectMinimum: z.number().int().min(0).max(100),
        maximumFailedCore: z.number().int().min(0).max(50),
        evaluationMode: z.enum(["OVERALL", "SUBJECTS"]).default("OVERALL"),
        subjectMinimums: z
          .record(z.string(), z.number().int().min(0).max(100))
          .default({}),
        excludedSubjectIds: z.array(id).max(100).default([]),
      })
      .parse(req.body);
    if (data.sourceClassId === data.targetClassId)
      throw new HttpError(400, "Promotion target must be a different class");
    res.json(
      await db.promotionRule.upsert({
        where: {
          sessionId_sourceClassId: {
            sessionId: data.sessionId,
            sourceClassId: data.sourceClassId,
          },
        },
        create: data,
        update: data,
      }),
    );
  });
  r.post(
    "/promotions/preview",
    permit("PROMOTIONS_MANAGE"),
    async (req, res) => {
      const { sessionId } = z.object({ sessionId: id }).parse(req.body),
        rules = await db.promotionRule.findMany({ where: { sessionId } }),
        sourceIds = rules.map((x) => x.sourceClassId);
      const [terms, students, courses] = await Promise.all([
        db.term.findMany({ where: { sessionId }, select: { id: true } }),
        db.user.findMany({
          where: { role: "STUDENT", classId: { in: sourceIds } },
          select: { id: true, classId: true },
        }),
        db.classSubject.findMany({
          where: { classId: { in: sourceIds } },
          include: { subject: true, rubric: { include: { components: true } } },
        }),
      ]);
      const grades =
        students.length && terms.length
          ? await db.gradeEntry.findMany({
              where: {
                studentId: { in: students.map((x) => x.id) },
                termId: { in: terms.map((x) => x.id) },
              },
            })
          : [];
      const grouped = groupsOf(
          grades.map((g) => ({
            ...g,
            bucket: `${g.studentId}:${g.termId}:${g.classSubjectId}`,
          })),
          "bucket",
        ),
        ruleByClass = new Map(rules.map((x) => [x.sourceClassId, x]));
      const run = await db.promotionRun.create({
          data: { sessionId, status: "PREVIEW", createdById: req.user.id },
        }),
        decisions = [];
      for (const student of students) {
        const rule = ruleByClass.get(student.classId),
          excluded = new Set(
            Array.isArray(rule.excludedSubjectIds)
              ? rule.excludedSubjectIds
              : [],
          ),
          minimums =
            rule.subjectMinimums && typeof rule.subjectMinimums === "object"
              ? rule.subjectMinimums
              : {},
          studentCourses = courses.filter(
            (c) =>
              c.classId === student.classId &&
              c.rubric &&
              !excluded.has(c.subjectId),
          ),
          subjectRows = [];
        for (const course of studentCourses) {
          const termTotals = terms.map((term) =>
            calculateSubject(
              grouped.get(`${student.id}:${term.id}:${course.id}`) || [],
              course.rubric,
            ),
          );
          subjectRows.push({
            subjectId: course.subjectId,
            total: termTotals.length
              ? termTotals.reduce((a, b) => a + b, 0) / termTotals.length
              : 0,
            core: course.subject.core,
          });
        }
        const average = subjectRows.length
            ? Math.round(
                subjectRows.reduce((a, b) => a + b.total, 0) /
                  subjectRows.length,
              )
            : 0,
          failedCore = subjectRows.filter(
            (x) => x.core && x.total < rule.coreSubjectMinimum,
          ).length,
          failedSubjects = subjectRows.filter(
            (x) =>
              minimums[x.subjectId] != null &&
              x.total < Number(minimums[x.subjectId]),
          ).length,
          passed =
            rule.evaluationMode === "SUBJECTS"
              ? failedSubjects === 0
              : average >= rule.minimumAverage &&
                failedCore <= rule.maximumFailedCore;
        decisions.push({
          runId: run.id,
          studentId: student.id,
          fromClassId: rule.sourceClassId,
          toClassId: passed ? rule.targetClassId : null,
          average,
          failedCore,
          outcome: passed ? "PROMOTE" : "REPEAT",
          reason: passed
            ? "Promotion criteria met"
            : rule.evaluationMode === "SUBJECTS"
              ? `${failedSubjects} required subject threshold(s) not met`
              : "Minimum average or compulsory-subject rule not met",
        });
      }
      if (decisions.length)
        await db.promotionDecision.createMany({ data: decisions });
      res.json(
        await db.promotionRun.findUnique({
          where: { id: run.id },
          include: {
            decisions: {
              include: { student: { select: { name: true } }, run: false },
            },
          },
        }),
      );
    },
  );
  r.post(
    "/promotions/:id/apply",
    permit("PROMOTIONS_MANAGE"),
    async (req, res) => {
      const result = await db.$transaction(
        async (tx) => {
          await lockRow(tx, "PromotionRun", req.params.id);
          const run = await tx.promotionRun.findUnique({
            where: { id: req.params.id },
            include: { decisions: true },
          });
          if (!run) throw new HttpError(404, "Promotion run not found");
          if (run.status !== "PREVIEW")
            throw new HttpError(409, "Promotion run was already applied");
          for (const d of run.decisions)
            if (d.outcome === "PROMOTE" && d.toClassId)
              await tx.user.update({
                where: { id: d.studentId },
                data: { classId: d.toClassId },
              });
          const saved = await tx.promotionRun.update({
            where: { id: run.id },
            data: { status: "APPLIED", appliedAt: new Date() },
          });
          await enqueue(tx, "promotion.applied", saved.id, {
            runId: saved.id,
            sessionId: saved.sessionId,
            decisions: run.decisions,
          });
          await audit(tx, req.user.id, "promotion.apply", run.id);
          return saved;
        },
        { timeout: 30000 },
      );
      res.json(result);
    },
  );
  r.get("/staff-attendance", async (req, res) => {
    const date = z
        .string()
        .date()
        .default(new Date().toISOString().slice(0, 10))
        .parse(req.query.date),
      where = {
        date: new Date(date),
        ...(req.user.role === "STAFF" ? { staffId: req.user.id } : {}),
      };
    res.json(
      await db.staffAttendance.findMany({
        where,
        include: { staff: { select: { id: true, name: true, email: true } } },
        orderBy: { markedAt: "asc" },
      }),
    );
  });
  r.post("/staff-attendance/self", async (req, res) => {
    if (req.user.role !== "STAFF")
      throw new HttpError(403, "Staff account required");
    const input = z
        .object({ note: z.string().trim().max(300).default("") })
        .parse(req.body),
      settings = await db.appSetting.findFirst(),
      now = new Date(),
      localTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: settings?.timeZone || "Africa/Lagos",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now),
      status =
        localTime > (settings?.staffLateAfterTime || "08:15")
          ? "LATE"
          : "PRESENT",
      date = new Date(
        now.toLocaleDateString("en-CA", {
          timeZone: settings?.timeZone || "Africa/Lagos",
        }),
      );
    const row = await db.staffAttendance.upsert({
      where: { staffId_date: { staffId: req.user.id, date } },
      create: { staffId: req.user.id, date, status, note: input.note },
      update: { status, note: input.note, markedAt: now },
    });
    await audit(db, req.user.id, "staffAttendance.mark", row.id);
    res.json(row);
  });
  r.get("/timetable", async (req, res) => {
    const where =
      req.user.role === "STUDENT"
        ? { classId: req.user.classId || "none" }
        : req.user.role === "STAFF"
          ? {
              OR: [
                { teacherId: req.user.id },
                { class: { classTeacherId: req.user.id } },
              ],
            }
          : {};
    res.json(
      await db.timetableEntry.findMany({
        where,
        include: {
          class: true,
          subject: true,
          teacher: { select: { id: true, name: true } },
        },
        orderBy: [{ dayOfWeek: "asc" }, { startsAt: "asc" }],
      }),
    );
  });
  r.post("/timetable", async (req, res) => {
    const data = z
        .object({
          classId: id,
          subjectId: id,
          teacherId: id.optional(),
          dayOfWeek: z.number().int().min(1).max(5),
          startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          room: z.string().trim().max(80).default(""),
        })
        .refine((x) => x.endsAt > x.startsAt, "End time must follow start time")
        .parse(req.body),
      teacherId = req.user.role === "STAFF" ? req.user.id : data.teacherId;
    if (!teacherId) throw new HttpError(400, "Choose a teacher");
    if (req.user.role === "STUDENT")
      throw new HttpError(403, "Teacher access required");
    if (
      req.user.role === "STAFF" &&
      !(await ownsCourse(
        req,
        await db.classSubject
          .findFirst({
            where: { classId: data.classId, subjectId: data.subjectId },
            select: { id: true },
          })
          .then((x) => x?.id || "none"),
      ))
    )
      throw new HttpError(403, "You can schedule assigned courses only");
    const row = await db.timetableEntry.create({
      data: { ...data, teacherId },
    });
    await audit(db, req.user.id, "timetable.create", row.id);
    res.status(201).json(row);
  });
  r.delete("/timetable/:id", async (req, res) => {
    const row = await db.timetableEntry.findUnique({
      where: { id: req.params.id },
    });
    if (!row) throw new HttpError(404, "Timetable entry not found");
    if (req.user.role === "STAFF" && row.teacherId !== req.user.id)
      throw new HttpError(
        403,
        "You can remove your own timetable entries only",
      );
    await db.timetableEntry.delete({ where: { id: row.id } });
    await audit(db, req.user.id, "timetable.delete", row.id);
    res.json({ ok: true });
  });
  return r;
}

const uploadRoot = () => resolve(config.UPLOAD_DIR);
const storageBucket = () => {
  if (!config.FIREBASE_STORAGE_BUCKET) return null;
  const app =
    getApps()[0] ||
    initializeApp({ storageBucket: config.FIREBASE_STORAGE_BUCKET });
  return getStorage(app).bucket(config.FIREBASE_STORAGE_BUCKET);
};
const storedBody = async (file) => {
  if (!/^[a-f0-9]{48}\.(pdf|png|jpg|txt)$/.test(file.storageName))
    throw new HttpError(404, "Stored file is unavailable");
  const bucket = storageBucket();
  if (bucket) {
    try {
      const [body] = await bucket
        .file(`uploads/${file.storageName}`)
        .download();
      return body;
    } catch (error) {
      if (error?.code === 404)
        throw new HttpError(404, "Stored file is unavailable; upload it again");
      throw error;
    }
  }
  try {
    return await readFile(join(uploadRoot(), file.storageName));
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new HttpError(404, "Stored file is unavailable; upload it again");
    throw error;
  }
};
const mimeExt = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "text/plain": ".txt",
};
const validFileContent = (mime, body) => {
  if (mime === "application/pdf")
    return body.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "image/png")
    return (
      body.length >= 8 &&
      body
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  if (mime === "image/jpeg")
    return (
      body.length >= 3 &&
      body[0] === 0xff &&
      body[1] === 0xd8 &&
      body[2] === 0xff
    );
  return mime === "text/plain" && !body.includes(0);
};
export function fileRoutes(app) {
  app.post("/api/files", async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length)
      throw new HttpError(400, "Choose a non-empty file");
    const purpose = String(req.headers["x-file-purpose"] || "attachment").slice(
      0,
      50,
    );
    if (req.user.role === "STUDENT" && purpose !== "submission")
      throw new HttpError(403, "Students may upload submission files only");
    if (
      req.user.role === "STAFF" &&
      ![
        "ASSIGNMENTS_MANAGE",
        "MATERIALS_MANAGE",
        "LIBRARY_MANAGE",
        "SETTINGS_MANAGE",
      ].some((p) => has(req, p))
    )
      throw new HttpError(403, "Your staff role does not permit uploads");
    if (
      purpose === "profile" &&
      req.user.role !== "ADMIN" &&
      !has(req, "STUDENTS_MANAGE")
    )
      throw new HttpError(403, "Student management permission required");
    const mime = req.headers["content-type"],
      original = String(req.headers["x-file-name"] || "file")
        .replace(/[\r\n]/g, "")
        .slice(0, 200);
    if (!mimeExt[mime])
      throw new HttpError(415, "Allowed files: PDF, PNG, JPEG, and text");
    if (!validFileContent(mime, req.body))
      throw new HttpError(415, "File content does not match its declared type");
    const dir = uploadRoot(),
      storageName = randomBytes(24).toString("hex") + mimeExt[mime],
      bucket = storageBucket();
    if (bucket)
      await bucket
        .file(`uploads/${storageName}`)
        .save(req.body, {
          resumable: false,
          contentType: mime,
          metadata: { cacheControl: "private, max-age=0" },
          preconditionOpts: { ifGenerationMatch: 0 },
        });
    else {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, storageName), req.body, { flag: "wx" });
    }
    res
      .status(201)
      .json(
        await db.storedFile.create({
          data: {
            storageName,
            originalName: original,
            mimeType: mime,
            size: req.body.length,
            purpose,
            createdById: req.user.id,
          },
        }),
      );
  });
  app.get("/api/files/:id", async (req, res) => {
    const f = await db.storedFile.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            libraryMaterials: true,
            assignmentAttachments: true,
            submissionFiles: true,
            materials: true,
          },
        },
      },
    });
    if (!f) throw new HttpError(404, "File not found");
    if (
      (f._count.libraryMaterials || f._count.materials) &&
      !featureEnabled("library")
    )
      throw new HttpError(404, "Library module is disabled");
    if (
      (f._count.assignmentAttachments || f._count.submissionFiles) &&
      !featureEnabled("assignments")
    )
      throw new HttpError(404, "Assignments module is disabled");
    const settings = await db.appSetting.findFirst({
        select: { principalSignaturePath: true },
      }),
      isSignature = settings?.principalSignaturePath === f.id;
    let permitted =
      req.user.role === "ADMIN" ||
      (isSignature &&
        (req.user.role === "STUDENT" || has(req, "REPORTS_VIEW")));
    if (req.user.role === "STUDENT")
      permitted =
        (isSignature &&
          !!(await db.reportComment.findFirst({
            where: { studentId: req.user.id, published: true },
            select: { id: true },
          }))) ||
        !!(await db.storedFile.findFirst({
          where: {
            id: f.id,
            OR: [
              { profileFor: { id: req.user.id } },
              {
                assignmentAttachments: {
                  some: {
                    assignment: {
                      published: true,
                      classSubject: { classId: req.user.classId || "none" },
                    },
                  },
                },
              },
              {
                submissionFiles: {
                  some: { submission: { studentId: req.user.id } },
                },
              },
              {
                materials: {
                  some: {
                    classSubject: { classId: req.user.classId || "none" },
                  },
                },
              },
              {
                libraryMaterials: {
                  some: {
                    published: true,
                    OR: [
                      { classId: null, subjectId: null },
                      { classId: req.user.classId || "none" },
                      {
                        subject: {
                          classSubjects: {
                            some: { classId: req.user.classId || "none" },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        }));
    if (req.user.role === "STAFF") {
      const scope = await staffTeachingScope(req),
        classIds = [
          ...new Set([
            ...scope.classWideIds,
            ...scope.courses.map((x) => x.classId),
          ]),
        ],
        courseIds = scope.courses.map((x) => x.id);
      permitted =
        (isSignature && has(req, "REPORTS_VIEW")) ||
        !!(await db.storedFile.findFirst({
          where: {
            id: f.id,
            OR: [
              { createdById: req.user.id },
              { profileFor: { classId: { in: classIds } } },
              {
                assignmentAttachments: {
                  some: { assignment: { classSubjectId: { in: courseIds } } },
                },
              },
              {
                submissionFiles: {
                  some: {
                    submission: {
                      assignment: { classSubjectId: { in: courseIds } },
                    },
                  },
                },
              },
              { materials: { some: { classSubjectId: { in: courseIds } } } },
              {
                libraryMaterials: {
                  some: libraryWhereForStaff(req.user.id, scope),
                },
              },
            ],
          },
        }));
    }
    if (!permitted) throw new HttpError(403, "File access denied");
    const body = await storedBody(f),
      libraryPdf =
        f.mimeType === "application/pdf" && f._count.libraryMaterials > 0,
      inline = libraryPdf || f.mimeType.startsWith("image/");
    if (inline)
      res.setHeader("Content-Disposition", 'inline; filename="view-only"');
    else res.attachment(f.originalName);
    if (libraryPdf) {
      res.setHeader("Accept-Ranges", "none");
      res.setHeader("X-Download-Options", "noopen");
    }
    res.type(f.mimeType).send(body);
  });
}
export async function publicAsset(req, res) {
  const settings = await db.appSetting.findFirst();
  if (
    !settings ||
    ![settings.logoPath, settings.watermarkPath].includes(req.params.id)
  )
    throw new HttpError(404, "Asset not found");
  const f = await db.storedFile.findUnique({ where: { id: req.params.id } });
  if (!f || !f.mimeType.startsWith("image/"))
    throw new HttpError(404, "Asset not found");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type(f.mimeType).send(await storedBody(f));
}
