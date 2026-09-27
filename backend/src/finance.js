import { Router } from "express";
import { z } from "zod";
import { permit } from "./auth.js";
import { audit, db } from "./db.js";
import { HttpError } from "./domain.js";

const id = z.string().min(1).max(100);
const effectiveAmount = (fee, concession) => {
  if (!concession) return fee.amountMinor;
  if (concession.kind === "SCHOLARSHIP") return 0;
  const reduction = Math.max(
    concession.amountMinor || 0,
    Math.round((fee.amountMinor * (concession.percent || 0)) / 100),
  );
  return Math.max(0, fee.amountMinor - reduction);
};

async function overview(organizationId) {
  const [settings, fees, students] = await Promise.all([
    db.financeSetting.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    }),
    db.feeStructure.findMany({
      where: { organizationId },
      include: {
        class: { select: { id: true, name: true } },
        session: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        concessions: true,
        payments: { select: { studentId: true, amountMinor: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: { role: "STUDENT" },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        feeSuspended: true,
        classId: true,
        class: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const balances = [];
  for (const student of students)
    for (const fee of fees.filter(
      (row) => row.active && row.classId === student.classId,
    )) {
      const concession = fee.concessions.find(
          (row) => row.studentId === student.id,
        ),
        dueMinor = effectiveAmount(fee, concession),
        paidMinor = fee.payments
          .filter((row) => row.studentId === student.id)
          .reduce((sum, row) => sum + row.amountMinor, 0);
      balances.push({
        student,
        feeId: fee.id,
        feeName: fee.name,
        currency: fee.currency,
        dueDate: fee.dueDate,
        grossMinor: fee.amountMinor,
        dueMinor,
        paidMinor,
        balanceMinor: Math.max(0, dueMinor - paidMinor),
        concession,
      });
    }
  return {
    settings,
    fees,
    students,
    balances,
    totals: {
      dueMinor: balances.reduce((sum, row) => sum + row.dueMinor, 0),
      paidMinor: balances.reduce((sum, row) => sum + row.paidMinor, 0),
      outstandingMinor: balances.reduce(
        (sum, row) => sum + row.balanceMinor,
        0,
      ),
    },
  };
}

export function financeRouter() {
  const router = Router();
  router.use(permit("PAYMENTS_MANAGE"));
  router.get("/overview", async (req, res) =>
    res.json(await overview(req.user.organizationId)),
  );
  router.post("/fees", async (req, res) => {
    const input = z
      .object({
        classId: id,
        sessionId: id,
        termId: id.nullable().default(null),
        name: z.string().trim().min(1).max(150),
        amountMinor: z.number().int().positive().max(2000000000),
        currency: z.literal("NGN"),
        dueDate: z.string().date().nullable().default(null),
      })
      .parse(req.body);
    const [schoolClass, session, term] = await Promise.all([
      db.class.findUnique({ where: { id: input.classId } }),
      db.academicSession.findUnique({ where: { id: input.sessionId } }),
      input.termId ? db.term.findUnique({ where: { id: input.termId } }) : null,
    ]);
    if (
      !schoolClass ||
      !session ||
      (input.termId && term?.sessionId !== session.id)
    )
      throw new HttpError(400, "Choose a valid class, session and term");
    const fee = await db.feeStructure.create({
      data: {
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    await audit(db, req.user.id, "finance.fee.create", fee.id);
    res.status(201).json(fee);
  });
  router.patch("/fees/:id", async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(150).optional(),
        amountMinor: z.number().int().positive().max(2000000000).optional(),
        dueDate: z.string().date().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const fee = await db.feeStructure.update({
      where: { id: req.params.id },
      data: {
        ...input,
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
      },
    });
    await audit(db, req.user.id, "finance.fee.update", fee.id);
    res.json(fee);
  });
  router.delete("/fees/:id", async (req, res) => {
    const used = await db.payment.count({
      where: { feeStructureId: req.params.id },
    });
    if (used)
      throw new HttpError(409, "Deactivate a fee that already has payments");
    await db.feeStructure.delete({ where: { id: req.params.id } });
    await audit(db, req.user.id, "finance.fee.delete", req.params.id);
    res.json({ ok: true });
  });
  router.put("/concessions", async (req, res) => {
    const input = z
      .object({
        studentId: id,
        feeStructureId: id,
        kind: z.enum(["SCHOLARSHIP", "DISCOUNT"]),
        percent: z.number().int().min(0).max(100).default(0),
        amountMinor: z.number().int().min(0).max(2000000000).default(0),
        reason: z.string().trim().max(300).default(""),
      })
      .parse(req.body);
    const [student, fee] = await Promise.all([
      db.user.findFirst({ where: { id: input.studentId, role: "STUDENT" } }),
      db.feeStructure.findUnique({ where: { id: input.feeStructureId } }),
    ]);
    if (!student || !fee || student.classId !== fee.classId)
      throw new HttpError(400, "Student must belong to the fee's class");
    const row = await db.studentFeeConcession.upsert({
      where: {
        studentId_feeStructureId: {
          studentId: input.studentId,
          feeStructureId: input.feeStructureId,
        },
      },
      create: input,
      update: input,
    });
    await audit(db, req.user.id, "finance.concession.save", row.id);
    res.json(row);
  });
  router.delete("/concessions/:id", async (req, res) => {
    const row = await db.studentFeeConcession.findFirst({
      where: {
        id: req.params.id,
        feeStructure: { organizationId: req.user.organizationId },
      },
    });
    if (!row) throw new HttpError(404, "Concession not found");
    await db.studentFeeConcession.delete({ where: { id: row.id } });
    await audit(db, req.user.id, "finance.concession.delete", req.params.id);
    res.json({ ok: true });
  });
  router.put("/settings", async (req, res) => {
    const input = z
      .object({ suspendUnpaidStudents: z.boolean() })
      .parse(req.body);
    res.json(
      await db.financeSetting.upsert({
        where: { organizationId: req.user.organizationId },
        create: { organizationId: req.user.organizationId, ...input },
        update: input,
      }),
    );
  });
  router.post("/enforce", async (req, res) => {
    const data = await overview(req.user.organizationId),
      overdue = new Set(
        data.balances
          .filter(
            (row) =>
              row.balanceMinor > 0 &&
              row.dueDate &&
              new Date(row.dueDate) <= new Date(),
          )
          .map((row) => row.student.id),
      );
    let suspended = 0,
      restored = 0;
    await db.$transaction(async (tx) => {
      for (const student of data.students) {
        if (data.settings.suspendUnpaidStudents && overdue.has(student.id)) {
          await tx.user.update({
            where: { id: student.id },
            data: { active: false, feeSuspended: true },
          });
          suspended++;
        } else if (student.feeSuspended) {
          await tx.user.update({
            where: { id: student.id },
            data: { active: true, feeSuspended: false },
          });
          restored++;
        }
      }
      await audit(tx, req.user.id, "finance.enforce", String(suspended));
    });
    res.json({ suspended, restored });
  });
  return router;
}
