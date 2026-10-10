import React, { useEffect, useState } from "react";
import { api } from "./api";

const formatMoney = (amount, currency) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(
    amount / 100,
  );

export function RenewalPage({ user, onRenewed, logout }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reference = new URLSearchParams(location.search).get("reference");
  useEffect(() => {
    api("/auth/renewal")
      .then(setDetails)
      .catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    if (!reference) return;
    setBusy(true);
    api("/auth/renewal/verify", { method: "POST", body: { reference } })
      .then(() => {
        history.replaceState({}, "", "/app");
        onRenewed();
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, [reference]);
  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/renewal/initialize", {
        method: "POST",
        body: {},
      });
      location.assign(result.authorizationUrl);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <main className="renewal-page">
      <section className="renewal-card">
        <span className="eyebrow">SCHOOLHOUSE BILLING</span>
        <h1>Renew your school subscription</h1>
        <p>
          {details?.schoolName || "Your school"} needs a subscription payment
          before the workspace can reopen.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {details?.plan && (
          <div className="renewal-plan">
            <strong>{details.plan.name}</strong>
            <span>
              {formatMoney(details.plan.amountMinor, details.plan.currency)} /{" "}
              {details.plan.interval}
            </span>
          </div>
        )}
        <p className="muted">
          Signed in as {user.email}.{" "}
          {details?.canPay
            ? "Payment is handled securely by Paystack."
            : "Please ask your school administrator to renew this subscription."}
        </p>
        {details?.canPay && (
          <button disabled={busy || !details.required} onClick={pay}>
            {busy ? "Checking payment…" : "Continue to Paystack"}
          </button>
        )}
        <button className="text-button" onClick={logout}>
          Sign out
        </button>
      </section>
    </main>
  );
}
