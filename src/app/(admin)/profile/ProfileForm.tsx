// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { signOut } from "next-auth/react";
import { Glass, Avatar, Chip, Icons } from "@/components/primitives";

export default function ProfileForm({ user, role, workspaceName }: { user: { id: string; name: string; email: string; signature?: string | null }; role: string; workspaceName: string }) {
  const [name, setName] = React.useState(user.name);
  const [signature, setSignature] = React.useState(user.signature || "");
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  async function save() {
    setSaving(true);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, signature, password: password || undefined }),
    });
    setSaving(false);
    setSavedAt(Date.now());
    setPassword("");
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ gap: 16, marginBottom: 18 }}>
          <Avatar name={name || user.email} size="xl" />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22 }}>{name || user.email}</h2>
            <div className="tiny">{user.email}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <Chip accent>{role}</Chip>
              <Chip>{workspaceName}</Chip>
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Full name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">New password <span className="tiny muted">(leave blank to keep)</span></label>
              <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Email signature <span className="tiny muted">(overrides workspace default)</span></label>
            <textarea
              className="input autogrow"
              data-max-lines="6"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={`Best,\n${name || "Your name"}`}
              style={{ fontFamily: "inherit", minHeight: 80 }}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          {savedAt && <span className="tiny" style={{ color: "var(--accent-solid)", marginRight: 12 }}>Saved</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Session</h2>
        <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
          <Icons.Logout size={13} /> Sign out
        </button>
      </Glass>
    </div>
  );
}
