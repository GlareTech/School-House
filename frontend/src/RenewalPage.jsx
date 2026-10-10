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
  const topupReference = new URLSearchParams(location.search).get("topup");
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
  useEffect(() => {
    if (!topupReference) return;
    setBusy(true);
    api("/auth/wallet/topup/verify", { method: "POST", body: { reference: topupReference } })
      .then(() => { history.replaceState({}, "", "/renew"); return api("/auth/renewal").then(setDetails); })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, [topupReference]);
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
  const payFromWallet = async () => {
    setBusy(true); setError("");
    try { await api("/auth/renewal/wallet", { method: "POST", body: {} }); await onRenewed(); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  const addFunds = async () => {
    setBusy(true); setError("");
    try {
      const result = await api("/auth/wallet/topup/initialize", { method: "POST", body: { amountMinor: Math.max(5000, details.plan.amountMinor - details.walletBalanceMinor) } });
      location.assign(result.authorizationUrl);
    } catch (err) { setError(err.message); setBusy(false); }
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
        {details?.canPay && <>
          <p>Verified wallet funds: {formatMoney(details.walletBalanceMinor || 0, details.plan.currency)}</p>
          {details.walletBalanceMinor >= details.plan.amountMinor
            ? <button disabled={busy} onClick={payFromWallet}>Renew from wallet</button>
            : <button disabled={busy} onClick={addFunds}>Add verified wallet funds with Paystack</button>}
          <button disabled={busy || !details.required} onClick={pay}>Pay subscription directly with Paystack</button>
        </>}
        <button className="text-button" onClick={logout}>
          Sign out
        </button>
      </section>
    </main>
  );
}
