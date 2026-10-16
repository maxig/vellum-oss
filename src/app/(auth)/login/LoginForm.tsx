// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/Icons";

export default function LoginForm({ callbackUrl, initialError }: { callbackUrl?: string; initialError?: string }) {
  const t = useTranslations("auth");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError ? t("invalid") : null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { redirect: false, email, password, callbackUrl: callbackUrl || "/dashboard" });
    setLoading(false);
    if (res?.error) {
      setError(t("invalid"));
      return;
    }
    window.location.href = res?.url || "/dashboard";
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <div className="sidebar-brand-logo">V</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>Vellum</div>
          <div className="tiny">{t("tagline")}</div>
        </div>
      </div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>{t("welcome")}</h1>
      <p style={{ color: "var(--ink-2)", marginBottom: 22, fontSize: 13.5 }}>{t("signInHint")}</p>

      <form onSubmit={onSubmit} className="col" style={{ gap: 12 }}>
        <div>
          <label className="label">{t("email")}</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" />
        </div>
        <div>
          <label className="label">{t("password")}</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && (
          <div className="chip chip-danger" style={{ height: "auto", padding: "8px 12px", borderRadius: 10 }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: "100%", marginTop: 4 }}>
          {loading ? t("signingIn") : t("signIn")}
          {!loading && <Icons.ArrowRight size={14} stroke={2} />}
        </button>
      </form>

      <div className="divider" style={{ margin: "22px 0 14px" }} />
      <div className="tiny" style={{ textAlign: "center", lineHeight: 1.5 }}>
        {t.rich("seedHint", { b: (c) => <b>{c}</b>, br: () => <br /> })}
      </div>
    </div>
  );
}
