import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";

const money = (minor, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(
    Number(minor || 0) / 100,
  );

export function FinancePage({ classes, run }) {
  const [data, setData] = useState(null),
    [catalog, setCatalog] = useState({ sessions: [] }),
    [view, setView] = useState("balances");
  const load = async () => {
    const [finance, academic] = await Promise.all([
      api("/finance/overview"),
      api("/academics/catalog"),
    ]);
    setData(finance);
    setCatalog(academic);
  };
  useEffect(() => {
    load().catch(() => {});
  }, []);
  const terms = useMemo(
    () =>
      catalog.sessions.flatMap((session) =>
        session.terms.map((term) => ({ ...term, sessionId: session.id })),
      ),
    [catalog],
  );
  const perform = (action, message) =>
    run(async () => {
      await action();
      await load();
    }, message);
  if (!data) return <div className="loading-panel">Loading finance…</div>;
  return (
    <div className="finance-page">
      <section className="dashboard-stats">
        <article>
          <span>Fees payable</span>
          <strong>{money(data.totals.dueMinor)}</strong>
        </article>
        <article>
          <span>Collected</span>
          <strong>{money(data.totals.paidMinor)}</strong>
        </article>
        <article>
          <span>Outstanding</span>
          <strong>{money(data.totals.outstandingMinor)}</strong>
        </article>
      </section>
      <div className="toolbar">
        {[
          ["balances", "Student balances"],
          ["fees", "Fee configuration"],
          ["concessions", "Scholarships & discounts"],
          ["payments", "Record payment"],
        ].map(([key, label]) => (
          <button
            type="button"
            className={view === key ? "" : "secondary"}
            onClick={() => setView(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="panel finance-enforcement">
        <label className="check">
          <input
            type="checkbox"
            checked={data.settings.suspendUnpaidStudents}
            onChange={(event) =>
              perform(
                () =>
                  api("/finance/settings", {
                    method: "PUT",
                    body: { suspendUnpaidStudents: event.target.checked },
                  }),
                "Finance policy updated",
              )
            }
          />{" "}
          Disable student access after an unpaid fee passes its due date
        </label>
        <button
          className="secondary"
          onClick={() =>
            perform(
              () => api("/finance/enforce", { method: "POST" }),
              "Student fee status synchronized",
            )
          }
        >
          Run payment-status sync
        </button>
        <small>
          Only accounts marked as fee-suspended are automatically restored after
          payment.
        </small>
      </section>
      {view === "fees" && (
        <>
          <section className="panel">
            <h2>Create class fee</h2>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget,
                  d = new FormData(form);
                perform(
                  () =>
                    api("/finance/fees", {
                      method: "POST",
                      body: {
                        classId: d.get("classId"),
                        sessionId: d.get("sessionId"),
                        termId: d.get("termId") || null,
                        name: d.get("name"),
                        amountMinor: Math.round(Number(d.get("amount")) * 100),
                        currency: d.get("currency"),
                        dueDate: d.get("dueDate") || null,
                      },
                    }),
                  "Fee configuration saved",
                );
                form.reset();
              }}
            >
              <label>
                Class
                <select name="classId" required>
                  <option value="">Choose class</option>
                  {classes.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Session
                <select name="sessionId" required>
                  <option value="">Choose session</option>
                  {catalog.sessions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Term / semester
                <select name="termId">
                  <option value="">Whole session</option>
                  {terms.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fee name
                <input name="name" required placeholder="Tuition fee" />
              </label>
              <label>
                Amount
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Currency
                <select name="currency" defaultValue="NGN">
                  <option>NGN</option>
                </select>
              </label>
              <label>
                Due date
                <input name="dueDate" type="date" />
              </label>
              <button>Save class fee</button>
            </form>
          </section>
          <section className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fee</th>
                  <th>Class</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.fees.map((fee) => (
                  <tr key={fee.id}>
                    <td>{fee.name}</td>
                    <td>{fee.class.name}</td>
                    <td>
                      {fee.session.name}
                      {fee.term ? ` · ${fee.term.name}` : ""}
                    </td>
                    <td>{money(fee.amountMinor, fee.currency)}</td>
                    <td>
                      {fee.dueDate
                        ? new Date(fee.dueDate).toLocaleDateString()
                        : "No deadline"}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          perform(
                            () =>
                              api(`/finance/fees/${fee.id}`, {
                                method: "PATCH",
                                body: { active: !fee.active },
                              }),
                            fee.active ? "Fee deactivated" : "Fee activated",
                          )
                        }
                      >
                        {fee.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {view === "concessions" && (
        <section className="panel">
          <h2>Scholarship or discount</h2>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget,
                d = new FormData(form);
              perform(
                () =>
                  api("/finance/concessions", {
                    method: "PUT",
                    body: {
                      studentId: d.get("studentId"),
                      feeStructureId: d.get("feeStructureId"),
                      kind: d.get("kind"),
                      percent: Number(d.get("percent") || 0),
                      amountMinor: Math.round(
                        Number(d.get("amount") || 0) * 100,
                      ),
                      reason: d.get("reason"),
                    },
                  }),
                "Student concession saved",
              );
            }}
          >
            <label>
              Student
              <select name="studentId" required>
                <option value="">Choose student</option>
                {data.students.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {row.class?.name || "No class"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fee
              <select name="feeStructureId" required>
                <option value="">Choose fee</option>
                {data.fees
                  .filter((row) => row.active)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.class.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Type
              <select name="kind">
                <option value="SCHOLARSHIP">Full scholarship</option>
                <option value="DISCOUNT">Discount</option>
              </select>
            </label>
            <label>
              Discount percent
              <input
                name="percent"
                type="number"
                min="0"
                max="100"
                defaultValue="0"
              />
            </label>
            <label>
              Fixed discount amount
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
              />
            </label>
            <label>
              Reason
              <input name="reason" maxLength="300" />
            </label>
            <button>Save scholarship / discount</button>
          </form>
        </section>
      )}
      {view === "payments" && (
        <section className="panel">
          <h2>Record school-fee payment</h2>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget,
                d = new FormData(form);
              perform(
                () =>
                  api("/admin/payments", {
                    method: "POST",
                    body: {
                      studentId: d.get("studentId"),
                      feeStructureId: d.get("feeStructureId") || null,
                      reference: d.get("reference"),
                      amountMinor: Math.round(Number(d.get("amount")) * 100),
                      currency: d.get("currency"),
                      description: d.get("description"),
                    },
                  }),
                "Payment recorded. Run payment-status sync to update access.",
              );
              form.reset();
            }}
          >
            <label>
              Student
              <select name="studentId" required>
                <option value="">Choose student</option>
                {data.students.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Apply to fee
              <select name="feeStructureId" required>
                <option value="">Choose fee</option>
                {data.fees
                  .filter((row) => row.active)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.class.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Reference
              <input name="reference" required />
            </label>
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label>
              Currency
              <select name="currency" defaultValue="NGN">
                <option>NGN</option>
              </select>
            </label>
            <label>
              Description
              <input
                name="description"
                defaultValue="School fee payment"
                required
              />
            </label>
            <button>Record payment</button>
          </form>
        </section>
      )}
      {view === "balances" && (
        <section className="panel table-wrap">
          <h2>Student fee balances</h2>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Fee</th>
                <th>Payable</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((row) => (
                <tr key={`${row.student.id}:${row.feeId}`}>
                  <td>
                    <strong>{row.student.name}</strong>
                    <small>{row.student.class?.name}</small>
                  </td>
                  <td>
                    {row.feeName}
                    {row.concession && (
                      <small>{row.concession.kind.toLowerCase()}</small>
                    )}
                  </td>
                  <td>{money(row.dueMinor, row.currency)}</td>
                  <td>{money(row.paidMinor, row.currency)}</td>
                  <td>{money(row.balanceMinor, row.currency)}</td>
                  <td>
                    <span
                      className={`badge ${row.student.active ? "active" : "warning"}`}
                    >
                      {row.student.feeSuspended
                        ? "Fee suspended"
                        : row.student.active
                          ? "Active"
                          : "Disabled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.balances.length && (
            <p className="empty">
              Create a class fee to begin tracking balances.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
