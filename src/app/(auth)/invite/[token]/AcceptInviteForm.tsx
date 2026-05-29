// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { signIn } from "next-auth/react";

export default function AcceptInviteForm({
  token,
  email,
  workspaceName,
  invitedByName,
}: {
  token: string;
  email: string;
  workspaceName: string;
  invitedByName: string;
}) {
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const r = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error || "Could not accept invite.");
      setLoading(false);
      return;
    }
    await signIn("credentials", { redirect: false, email, password });
    window.location.href = "/dashboard";
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <div className="sidebar-brand-logo">V</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Vellum</div>
          <div className="tiny">{invitedByName} invited you to {workspaceName}</div>
        </div>
      </div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Accept invite</h1>
      <p style={{ color: "var(--ink-2)", marginBottom: 22 }}>Set up your account for <b>{email}</b>.</p>
      <form onSubmit={onSubmit} className="col" style={{ gap: 12 }}>
        <div>
          <label className="label">Full name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Choose a password</label>
          <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="chip chip-danger" style={{ height: "auto", padding: "8px 12px", borderRadius: 10 }}>{error}</div>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>{loading ? "Creating…" : "Create account"}</button>
      </form>
    </div>
  );
}
