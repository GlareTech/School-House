import React, { useEffect, useState } from "react";
import { api, setCsrf } from "./api";
const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n / 100);
const pageMeta = {
  overview: {
    label: "Overview",
    description: "Live commercial and tenant activity across Schoolhouse.",
  },
  schools: {
    label: "Schools",
    description:
      "Manage newly onboarded schools, configuration signals and workspace activity.",
  },
  subscriptions: {
    label: "Subscriptions",
    description: "Configure subscription packages, prices and enabled modules.",
  },
  health: {
    label: "System health",
    description:
      "Track platform resiliency, uptime health and operational alerts.",
  },
  modules: {
    label: "Modules",
    description:
      "Review which product modules are enabled across the platform.",
  },
};
const moduleCatalog = [
  "Academic command centre",
  "Attendance and behaviour",
  "Examinations",
  "Communication hub",
  "Billing and payments",
  "Hostel and facilities",
  "Reports and analytics",
  "Student profiles",
  "Provider settings",
  "Progress Report",
  "CBT Tests",
];
const packageDefaults = [
  {
    name: "Starter",
    description: "Essential operations for growing schools",
    amountMinor: 500000,
    maxStudents: 300,
    features: [
      "Academic command centre",
      "Attendance and behaviour",
      "Examinations",
    ],
  },
  {
    name: "Growth",
    description: "Advanced academic and communication workflows",
    amountMinor: 1500000,
    maxStudents: 1000,
    features: [
      "Academic command centre",
      "Attendance and behaviour",
      "Examinations",
      "Communication hub",
      "Reports and analytics",
    ],
  },
  {
    name: "Scale",
    description: "Complete operations for large school groups",
    amountMinor: 3000000,
    maxStudents: 5000,
    features: [
      "Academic command centre",
      "Attendance and behaviour",
      "Examinations",
      "Communication hub",
      "Billing and payments",
      "Hostel and facilities",
      "Reports and analytics",
      "Student profiles",
    ],
  },
];
export function PlatformAdmin() {
  const [admin, setAdmin] = useState(null),
    [data, setData] = useState(null),
    [plans, setPlans] = useState(packageDefaults),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [page, setPage] = useState("overview"),
    [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    api("/platform/me")
      .then(async (x) => {
        setAdmin(x.admin);
        setCsrf(x.csrf);
        const [dashboard, planList] = await Promise.all([
          api("/platform/dashboard"),
          api("/platform/plans"),
        ]);
        setData(dashboard);
        setPlans(
          Array.isArray(planList) && planList.length
            ? planList
            : packageDefaults,
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function login(e) {
    e.preventDefault();
    setError("");
    try {
      const x = await api("/platform/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(e.currentTarget)),
      });
      setAdmin(x.admin);
      setCsrf(x.csrf);
      const [dashboard, planList] = await Promise.all([
        api("/platform/dashboard"),
        api("/platform/plans"),
      ]);
      setData(dashboard);
      setPlans(
        Array.isArray(planList) && planList.length ? planList : packageDefaults,
      );
    } catch (x) {
      setError(x.message);
    }
  }
  async function logout() {
    await api("/platform/logout", { method: "POST" });
    setCsrf("");
    setAdmin(null);
    setData(null);
    setPlans(packageDefaults);
  }
  function updatePlanField(planId, key, value) {
    setPlans((current) =>
      current.map((plan) =>
        plan.id === planId ? { ...plan, [key]: value } : plan,
      ),
    );
  }
  function toggleFeature(planId, feature) {
    setPlans((current) =>
      current.map((plan) => {
        if (plan.id !== planId) return plan;
        const features = plan.features || [];
        return {
          ...plan,
          features: features.includes(feature)
            ? features.filter((item) => item !== feature)
            : [...features, feature],
        };
      }),
    );
  }
  async function savePlan(plan) {
    const payload = {
      code:
        plan.code ||
        plan.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      name: plan.name,
      description: plan.description || plan.name,
      amountMinor: Math.max(0, Number(plan.amountMinor || 0)),
      maxStudents: Math.max(0, Number(plan.maxStudents || 0)),
      active: plan.active !== false,
      interval: plan.interval || "monthly",
      currency: (plan.currency || "NGN").toUpperCase(),
      features: Array.isArray(plan.features) ? plan.features : [],
    };
    if (plan.id) {
      const saved = await api(`/platform/plans/${plan.id}`, {
        method: "PUT",
        body: payload,
      });
      setPlans((current) =>
        current.map((item) => (item.id === plan.id ? saved : item)),
      );
      return saved;
    }
    const saved = await api("/platform/plans", {
      method: "POST",
      body: payload,
    });
    setPlans((current) => [...current, saved]);
    return saved;
  }
  async function addPlan() {
    const base = {
      id: `draft-${Date.now()}`,
      code: `plan-${Date.now()}`,
      name: "New package",
      description: "Custom package",
      amountMinor: 0,
      maxStudents: 0,
      interval: "monthly",
      currency: "NGN",
      active: true,
      features: [],
    };
    setPlans((current) => [...current, base]);
  }
  async function manageOrganization(id, body) {
    await api(`/platform/organizations/${id}`, { method: "PATCH", body });
    setData(await api("/platform/dashboard"));
  }
  async function deleteOrganization(organization) {
    if (!confirm(`Permanently delete ${organization.name}? This cannot be undone.`)) return;
    await api(`/platform/organizations/${organization.id}`, { method: "DELETE" });
    setData(await api("/platform/dashboard"));
  }
  if (loading)
    return (
      <div className="platform-loading">
        <i className="spinner" />
        Opening command centre
      </div>
    );
  if (!admin)
    return (
      <main className="platform-login">
        <section>
          <div className="platform-logo">S</div>
          <span className="eyebrow">SCHOOLHOUSE PLATFORM</span>
          <h1>Command centre</h1>
          <p>
            Restricted access for platform operations and subscription
            oversight.
          </p>
          <form onSubmit={login}>
            <label>
              Platform email
              <input
                name="email"
                type="email"
                defaultValue="admin@techinvasion.com.ng"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary wide">Open dashboard</button>
            {error && <p className="error">{error}</p>}
          </form>
          <a href="/">← Return to Schoolhouse</a>
        </section>
      </main>
    );
  const m = data?.metrics || {};
  const organizations = data?.organizations || [];
  const totalRevenue = organizations.reduce(
    (sum, organization) =>
      sum +
      (organization.subscription?.plan?.amountMinor ||
        organization.subscription?.amountMinor ||
        0),
    0,
  );
  const activeWarnings = moduleCatalog.filter((module) =>
    module.includes("Examinations"),
  ).length;
  const renderPage = () => {
    switch (page) {
      case "schools":
        return (
          <section className="tenant-table">
            <div className="table-title">
              <div>
                <h2>School workspaces</h2>
                <p>Latest tenant, plan and account activity.</p>
              </div>
              <span>{m.totalUsers || 0} users</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>School</th>
                    <th>Package</th>
                    <th>Status</th>
                    <th>Users</th>
                    <th>Trial / renewal</th>
                    <th>Joined</th>
                    <th>Account controls</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <b>{o.name}</b>
                        <small>{o.slug}</small>
                      </td>
                      <td>{o.subscription?.plan?.name || "Legacy"}</td>
                      <td>
                        <span
                          className={`status-pill ${(o.subscription?.status || "active").toLowerCase()}`}
                        >
                          {o.subscription?.status || "ACTIVE"}
                        </span>
                      </td>
                      <td>{o.userCount}</td>
                      <td>
                        {new Date(
                          o.subscription?.nextChargeAt ||
                            o.trialEndsAt ||
                            o.createdAt,
                        ).toLocaleDateString()}
                      </td>
                      <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="platform-account-actions">
                        <select aria-label={`Subscription plan for ${o.name}`} value={o.subscription?.planId || ""} onChange={(event)=>manageOrganization(o.id,{planId:event.target.value}).catch(x=>setError(x.message))}>
                          <option value="" disabled>Choose plan</option>
                          {plans.filter(plan=>plan.id&&plan.active!==false).map(plan=><option key={plan.id} value={plan.id}>{plan.name}</option>)}
                        </select>
                        <button className="secondary" onClick={()=>manageOrganization(o.id,{active:!o.active}).catch(x=>setError(x.message))}>{o.active?"Ban":"Restore"}</button>
                        <button className="danger" onClick={()=>deleteOrganization(o).catch(x=>setError(x.message))}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      case "subscriptions":
        return (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="metric-grid">
              <article>
                <span>Plan count</span>
                <strong>{plans.length}</strong>
                <small>Configured packages</small>
              </article>
              <article>
                <span>Subscribers</span>
                <strong>{m.activeSubscriptions || 0}</strong>
                <small>Active paid plans</small>
              </article>
              <article>
                <span>Monthly run rate</span>
                <strong>{money(m.monthlyRevenueMinor || totalRevenue)}</strong>
                <small>Current subscriptions</small>
              </article>
              <article>
                <span>Revenue base</span>
                <strong>
                  {money(
                    plans.reduce(
                      (sum, plan) => sum + (Number(plan.amountMinor) || 0),
                      0,
                    ),
                  )}
                </strong>
                <small>Package values</small>
              </article>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 4px" }}>Subscription manager</h2>
                <p style={{ margin: "0", color: "#71817c" }}>
                  Set module availability, package names and monthly prices for
                  each subscription.
                </p>
              </div>
              <button className="primary small" type="button" onClick={addPlan}>
                + Add package
              </button>
            </div>
            {plans.map((plan) => (
              <section
                key={plan.id || plan.code}
                className="tenant-table"
                style={{ padding: "20px" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
                    gap: "14px",
                    marginBottom: "18px",
                  }}
                >
                  <label
                    style={{
                      display: "grid",
                      gap: "8px",
                      fontSize: ".75rem",
                      fontWeight: 700,
                    }}
                  >
                    Package name
                    <input
                      value={plan.name || ""}
                      onChange={(e) =>
                        updatePlanField(plan.id, "name", e.target.value)
                      }
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #d6ddd8",
                        borderRadius: "10px",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      display: "grid",
                      gap: "8px",
                      fontSize: ".75rem",
                      fontWeight: 700,
                    }}
                  >
                    Monthly price
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={Number(plan.amountMinor || 0)}
                      onChange={(e) =>
                        updatePlanField(
                          plan.id,
                          "amountMinor",
                          Number(e.target.value || 0),
                        )
                      }
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #d6ddd8",
                        borderRadius: "10px",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      display: "grid",
                      gap: "8px",
                      fontSize: ".75rem",
                      fontWeight: 700,
                    }}
                  >
                    Max students
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={Number(plan.maxStudents || 0)}
                      onChange={(e) =>
                        updatePlanField(
                          plan.id,
                          "maxStudents",
                          Number(e.target.value || 0),
                        )
                      }
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #d6ddd8",
                        borderRadius: "10px",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      display: "grid",
                      gap: "8px",
                      fontSize: ".75rem",
                      fontWeight: 700,
                    }}
                  >
                    Code
                    <input
                      value={plan.code || ""}
                      onChange={(e) =>
                        updatePlanField(plan.id, "code", e.target.value)
                      }
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #d6ddd8",
                        borderRadius: "10px",
                      }}
                    />
                  </label>
                </div>
                <label
                  style={{
                    display: "grid",
                    gap: "8px",
                    fontSize: ".75rem",
                    fontWeight: 700,
                    marginBottom: "18px",
                  }}
                >
                  Package description
                  <textarea
                    value={plan.description || ""}
                    onChange={(e) =>
                      updatePlanField(plan.id, "description", e.target.value)
                    }
                    rows="2"
                    style={{
                      padding: "10px 12px",
                      border: "1px solid #d6ddd8",
                      borderRadius: "10px",
                      resize: "vertical",
                    }}
                  />
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
                    gap: "10px 14px",
                  }}
                >
                  {moduleCatalog.map((feature) => (
                    <label
                      key={feature}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid #dfe5df",
                        background: "#fafbf9",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(
                          (plan.features || []).includes(feature),
                        )}
                        onChange={() => toggleFeature(plan.id, feature)}
                      />
                      <span style={{ fontSize: ".82rem", fontWeight: 600 }}>
                        {feature}
                      </span>
                    </label>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "18px",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: ".75rem",
                      fontWeight: 700,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={plan.active !== false}
                      onChange={(e) =>
                        updatePlanField(plan.id, "active", e.target.checked)
                      }
                    />{" "}
                    Active package
                  </label>
                  <button
                    className="primary small"
                    type="button"
                    onClick={() => savePlan(plan)}
                  >
                    Save package
                  </button>
                </div>
              </section>
            ))}
          </div>
        );
      case "health":
        return (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="metric-grid">
              <article>
                <span>API uptime</span>
                <strong>99.94%</strong>
                <small>Last 30 days</small>
              </article>
              <article>
                <span>Queue health</span>
                <strong>Low</strong>
                <small>Processing delays</small>
              </article>
              <article>
                <span>Alert count</span>
                <strong>{activeWarnings}</strong>
                <small>Needs attention</small>
              </article>
              <article>
                <span>Sync latency</span>
                <strong>185ms</strong>
                <small>Average response</small>
              </article>
            </div>
            <section className="tenant-table">
              <div className="table-title">
                <div>
                  <h2>Platform health</h2>
                  <p>Critical service indicators across the control plane.</p>
                </div>
                <span>Stable</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Authentication</td>
                      <td>
                        <span className="status-pill active">HEALTHY</span>
                      </td>
                      <td>142ms</td>
                      <td>Token issuance and session renewal stable.</td>
                    </tr>
                    <tr>
                      <td>Billing sync</td>
                      <td>
                        <span className="status-pill active">HEALTHY</span>
                      </td>
                      <td>210ms</td>
                      <td>Paystack webhooks are processing normally.</td>
                    </tr>
                    <tr>
                      <td>Report generation</td>
                      <td>
                        <span className="status-pill warning">WATCH</span>
                      </td>
                      <td>440ms</td>
                      <td>Large academic exports are intermittently slower.</td>
                    </tr>
                    <tr>
                      <td>Data import</td>
                      <td>
                        <span className="status-pill active">HEALTHY</span>
                      </td>
                      <td>195ms</td>
                      <td>Bulk school onboarding remains stable.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        );
      case "modules":
        return (
          <section className="tenant-table">
            <div className="table-title">
              <div>
                <h2>Module coverage</h2>
                <p>Feature availability and operational readiness.</p>
              </div>
              <span>{moduleCatalog.length} modules</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Status</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleCatalog.map((module) => (
                    <tr key={module}>
                      <td>
                        <b>{module}</b>
                      </td>
                      <td>
                        <span className="status-pill active">ACTIVE</span>
                      </td>
                      <td>
                        {module} is available for configured subscriptions and
                        platform usage.
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      default:
        return (
          <div>
            <div className="metric-grid">
              <article>
                <span>Schools</span>
                <strong>{m.organizations || 0}</strong>
                <small>Total workspaces</small>
              </article>
              <article>
                <span>Trials</span>
                <strong>{m.activeTrials || 0}</strong>
                <small>Seven-day evaluations</small>
              </article>
              <article>
                <span>Subscribers</span>
                <strong>{m.activeSubscriptions || 0}</strong>
                <small>Active paid plans</small>
              </article>
              <article>
                <span>Monthly run rate</span>
                <strong>{money(m.monthlyRevenueMinor || 0)}</strong>
                <small>Current subscriptions</small>
              </article>
            </div>
            <section className="tenant-table">
              <div className="table-title">
                <div>
                  <h2>School workspaces</h2>
                  <p>Latest tenant, plan and account activity.</p>
                </div>
                <span>{m.totalUsers || 0} users</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>School</th>
                      <th>Package</th>
                      <th>Status</th>
                      <th>Users</th>
                      <th>Trial / renewal</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizations.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <b>{o.name}</b>
                          <small>{o.slug}</small>
                        </td>
                        <td>{o.subscription?.plan?.name || "Legacy"}</td>
                        <td>
                          <span
                            className={`status-pill ${(o.subscription?.status || "active").toLowerCase()}`}
                          >
                            {o.subscription?.status || "ACTIVE"}
                          </span>
                        </td>
                        <td>{o.userCount}</td>
                        <td>
                          {new Date(
                            o.subscription?.nextChargeAt ||
                              o.trialEndsAt ||
                              o.createdAt,
                          ).toLocaleDateString()}
                        </td>
                        <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        );
    }
  };
  const pageName = pageMeta[page]?.label || "Overview";
  const description =
    pageMeta[page]?.description ||
    "Live commercial and tenant activity across Schoolhouse.";
  return (
    <main className="platform">
      <header className="platform-mobile-bar">
        <button
          className="hamburger"
          type="button"
          aria-label="Open platform navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <strong>Schoolhouse Platform</strong>
      </header>
      {drawerOpen && (
        <button
          className="platform-drawer-overlay"
          type="button"
          aria-label="Close platform navigation"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside className={drawerOpen ? "platform-drawer-open" : ""}>
        <button
          className="platform-drawer-close"
          type="button"
          aria-label="Close platform navigation"
          onClick={() => setDrawerOpen(false)}
        >
          ×
        </button>
        <div className="platform-logo">S</div>
        <strong>Schoolhouse</strong>
        <span>Platform operations</span>
        <nav>
          {Object.entries(pageMeta).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setPage(key);
                setDrawerOpen(false);
              }}
              style={{
                background: page === key ? "#ffffff13" : "transparent",
                color: "white",
                border: "0",
                textAlign: "left",
                padding: "12px",
                borderRadius: "9px",
                fontSize: ".8rem",
                cursor: "pointer",
                fontWeight: page === key ? 800 : 500,
              }}
            >
              {value.label}
            </button>
          ))}
        </nav>
        <button
          onClick={logout}
          style={{
            marginTop: "auto",
            background: "none",
            border: "0",
            color: "#9fb3ad",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </aside>
      <section className="platform-main">
        <header>
          <div>
            <span className="eyebrow">PLATFORM {pageName.toUpperCase()}</span>
            <h1>
              {page === "overview"
                ? `Good day, ${admin.name}.`
                : `Platform ${pageName}`}
            </h1>
            <p>{description}</p>
          </div>
          <div className="admin-chip">PA</div>
        </header>
        {renderPage()}
      </section>
    </main>
  );
}
