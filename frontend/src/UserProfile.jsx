import React, { useState } from "react";
import { api } from "./api";

export function UserProfile({ user, open, onClose, onUpdated }) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!open) return null;
  const perform = async (work, success) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const updateProfile = (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    perform(async () => {
      const result = await api("/auth/profile", { method: "PATCH", body });
      onUpdated(result.user);
    }, "Profile updated.");
  };
  const changePassword = (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    perform(async () => {
      await api("/auth/change-password", {
        method: "POST",
        body: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      });
      form.reset();
    }, "Password changed. Other signed-in devices have been logged out.");
  };
  return (
    <div
      className="modal-backdrop account-profile-modal"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal-card wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <header>
          <div>
            <span className="eyebrow">YOUR ACCOUNT</span>
            <h2 id="profile-title">User profile</h2>
            <p className="muted">
              {user.email} · {user.role.toLowerCase()}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Close profile"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="success" role="status">
            {message}
          </div>
        )}
        <div className="account-profile-grid">
          <form className="panel form-grid" onSubmit={updateProfile}>
            <h3>Personal information</h3>
            <label>
              Full name
              <input
                name="name"
                defaultValue={user.name}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label>
              Email
              <input value={user.email} disabled />
            </label>
            <label>
              Phone
              <input
                name="phone"
                defaultValue={user.phone || ""}
                maxLength={50}
              />
            </label>
            <label>
              Address
              <textarea
                name="address"
                defaultValue={user.address || ""}
                maxLength={1000}
              />
            </label>
            <button disabled={busy}>Save profile</button>
          </form>
          <form className="panel form-grid" onSubmit={changePassword}>
            <h3>Reset password</h3>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <button disabled={busy}>Change password</button>
          </form>
        </div>
      </section>
    </div>
  );
}
