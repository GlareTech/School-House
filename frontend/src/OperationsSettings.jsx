import React, { useEffect, useState } from "react";
import { api } from "./api";

const money = (amount, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(
    (amount || 0) / 100,
  );

export function WalletPage({ run, onChange }) {
  const [wallet, setWallet] = useState({
      balanceMinor: 0,
      subscriptionBalanceMinor: 0,
      currency: "NGN",
      transactions: [],
    }),
    [details, setDetails] = useState(null),
    [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    Promise.all([api("/admin/wallet"), api("/auth/renewal")]).then(([x, renewal]) => {
      setWallet(x);
      setDetails(renewal);
      onChange?.(x);
    });
  useEffect(() => {
    const reference = new URLSearchParams(location.search).get("topup");
    if (!reference) { load().catch((err) => setError(err.message)); return; }
    setBusy(true);
    api("/auth/wallet/topup/verify", { method: "POST", body: { reference } })
      .then(() => { history.replaceState({}, "", "/app"); return load(); })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, []);
  const topup = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api("/auth/wallet/topup/initialize", { method: "POST", body: { amountMinor: Math.round(Number(amount) * 100) } });
      location.assign(result.authorizationUrl);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const renew = async () => {
    if (!confirm(`Renew ${details.plan.name} for ${money(details.plan.amountMinor, details.plan.currency)} from verified wallet funds? Any existing automatic card subscription will be stopped.`)) return;
    setBusy(true); setError("");
    try { await api("/auth/renewal/wallet", { method: "POST", body: {} }); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="operations-page">
      <section className="wallet-hero">
        <span className="eyebrow">SCHOOL WALLET</span>
        <strong>{money(wallet.balanceMinor, wallet.currency)}</strong>
        <p>School-fee receipts appear in this total. Only verified Paystack top-ups can pay for a subscription.</p>
      </section>
      <section className="panel">
        <h2>Subscription renewal</h2>
        {error && <p className="error" role="alert">{error}</p>}
        <p>Verified top-ups available: <strong>{money(wallet.subscriptionBalanceMinor, wallet.currency)}</strong></p>
        {details?.plan && <p>{details.plan.name} · {money(details.plan.amountMinor, details.plan.currency)} / {details.plan.interval}</p>}
        {details?.canPay && <>
          <form className="form-grid" onSubmit={topup}>
            <label>Paystack top-up amount<input type="number" min="50" max="1000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
            <button disabled={busy}>Add funds with Paystack</button>
          </form>
          <button disabled={busy || !details.plan || wallet.subscriptionBalanceMinor < details.plan.amountMinor} onClick={renew}>Renew from wallet</button>
          <p className="muted">Wallet renewal stops automatic card billing. You can renew again from your wallet or through Paystack.</p>
        </>}
      </section>
      <section className="panel table-wrap">
        <h2>Wallet activity</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {wallet.transactions.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.reference}</td>
                <td>{row.description}</td>
                <td
                  className={
                    row.type === "CREDIT" ? "wallet-credit" : "wallet-debit"
                  }
                >
                  {row.type === "CREDIT" ? "+" : "−"}
                  {money(row.amountMinor, wallet.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!wallet.transactions.length && (
          <p className="empty">No wallet activity yet.</p>
        )}
      </section>
    </div>
  );
}

export function ProviderSettings({ run }) {
  const [settings, setSettings] = useState({
    emailProvider: "PLATFORM",
    emailFrom: "",
    smsProvider: "PLATFORM",
    twilioFrom: "",
    resendConfigured: false,
    twilioConfigured: false,
  });
  const load = () => api("/admin/providers").then(setSettings);
  useEffect(() => {
    load().catch(() => {});
  }, []);
  return (
    <section className="panel provider-settings">
      <span className="eyebrow">COMMUNICATION PROVIDERS</span>
      <h2>Email and SMS integrations</h2>
      <p className="muted">
        Credentials are encrypted before storage. Saved secrets are never sent
        back to the browser.
      </p>
      <form
        key={`${settings.emailProvider}-${settings.smsProvider}-${settings.emailFrom}-${settings.twilioFrom}`}
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          run(async () => {
            await api("/admin/providers", {
              method: "PUT",
              body: {
                emailProvider: d.get("emailProvider"),
                emailFrom: d.get("emailFrom"),
                resendApiKey: d.get("resendApiKey"),
                smsProvider: d.get("smsProvider"),
                twilioAccountSid: d.get("twilioAccountSid"),
                twilioAuthToken: d.get("twilioAuthToken"),
                twilioFrom: d.get("twilioFrom"),
              },
            });
            await load();
          }, "Provider settings saved");
        }}
      >
        <label>
          Email provider
          <select name="emailProvider" defaultValue={settings.emailProvider}>
            <option value="PLATFORM">Platform email</option>
            <option value="RESEND">Custom Resend</option>
          </select>
        </label>
        <label>
          Verified sender email
          <input
            name="emailFrom"
            type="email"
            defaultValue={settings.emailFrom}
            placeholder="school@example.com"
          />
        </label>
        <label>
          Resend API key
          <input
            name="resendApiKey"
            type="password"
            autoComplete="new-password"
            placeholder={
              settings.resendConfigured
                ? "Saved — leave blank to keep"
                : "Enter API key"
            }
          />
        </label>
        <label>
          SMS provider
          <select name="smsProvider" defaultValue={settings.smsProvider}>
            <option value="PLATFORM">Platform SMS (wallet billing)</option>
            <option value="DISABLED">Disabled</option>
            <option value="TWILIO">Twilio</option>
          </select>
        </label>
        <label>
          Twilio account SID
          <input
            name="twilioAccountSid"
            type="password"
            autoComplete="new-password"
            placeholder={
              settings.twilioConfigured
                ? "Saved — leave blank to keep"
                : "Enter account SID"
            }
          />
        </label>
        <label>
          Twilio auth token
          <input
            name="twilioAuthToken"
            type="password"
            autoComplete="new-password"
            placeholder={
              settings.twilioConfigured
                ? "Saved — leave blank to keep"
                : "Enter auth token"
            }
          />
        </label>
        <label>
          Twilio sender number
          <input
            name="twilioFrom"
            defaultValue={settings.twilioFrom}
            placeholder="+1234567890"
          />
        </label>
        <button>Save providers</button>
      </form>
    </section>
  );
}

export function SyncDevices({ run }) {
  const [devices, setDevices] = useState([]),
    [credential, setCredential] = useState(null);
  const load = () => api("/admin/sync/devices").then(setDevices);
  useEffect(() => {
    load().catch(() => {});
  }, []);
  return (
    <section className="panel sync-devices">
      <div className="panel-title">
        <div>
          <h2>Offline device API</h2>
          <p className="muted">
            Register each offline installation and use its token with the push,
            pull and checkpoint endpoints.
          </p>
        </div>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            d = new FormData(form);
          run(async () => {
            const result = await api("/admin/sync/devices", {
              method: "POST",
              body: { name: d.get("name"), siteId: d.get("siteId") },
            });
            setCredential(result);
            form.reset();
            await load();
          }, "Offline device registered");
        }}
      >
        <label>
          Device name
          <input name="name" placeholder="Front office computer" required />
        </label>
        <label>
          Site ID
          <input
            name="siteId"
            placeholder="front-office-01"
            pattern="[A-Za-z0-9_-]{2,80}"
            required
          />
        </label>
        <button>Generate API token</button>
      </form>
      {credential && (
        <div className="device-token" role="status">
          <strong>Copy this token now. It will not be shown again.</strong>
          <code>{credential.token}</code>
          <small>Base endpoint: {credential.endpoint}</small>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Site ID</th>
              <th>Last sync</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td>{device.name}</td>
                <td>
                  <code>{device.siteId}</code>
                </td>
                <td>
                  {device.lastSeenAt
                    ? new Date(device.lastSeenAt).toLocaleString()
                    : "Never"}
                </td>
                <td>{device.active ? "Active" : "Disabled"}</td>
                <td>
                  {device.active && (
                    <button
                      className="text-button danger"
                      onClick={() =>
                        run(async () => {
                          await api("/admin/sync/devices/" + device.id, {
                            method: "DELETE",
                          });
                          await load();
                        }, "Device disabled")
                      }
                    >
                      Disable
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Offline sync API</summary>
        <code>
          GET /api/device-sync/checkpoint
          <br />
          POST /api/device-sync/push
          <br />
          GET /api/device-sync/pull?cursor=ISO_DATE
        </code>
        <p>
          Send the generated token as <code>Authorization: Bearer TOKEN</code>.
          Push events use monotonic sequence and entity-version numbers for
          idempotency and conflict detection.
        </p>
      </details>
    </section>
  );
}
