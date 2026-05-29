// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Icons } from "@/components/Icons";

export default function OnboardingForm({ redirectAfter = "/dashboard" }: { redirectAfter?: string }) {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [color, setColor] = React.useState("conic");
  const [industry, setIndustry] = React.useState("Software");
  const [size, setSize] = React.useState("1–10");
  const [seed, setSeed] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function autoSlug(v: string) {
    const s = v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    setSlug(s);
    if (!domain) setDomain(`${s}.com`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/workspace/create", {
      method: "POST",
      body: JSON.stringify({ name, slug, domain, color, industry, size, seed }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error || "Could not create workspace.");
      return;
    }
    window.location.href = redirectAfter;
  }

  return (
    <form onSubmit={submit} className="col" style={{ gap: 14 }}>
      <div>
        <label className="label">Company name</label>
        <input className="input" required autoFocus value={name} onChange={(e) => { setName(e.target.value); autoSlug(e.target.value); }} placeholder="goscore"/>
      </div>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="label">Subdomain</label>
          <div className="row" style={{ alignItems: "center", gap: 4 }}>
            <input className="input" required value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="goscore"/>
            <span className="tiny mono" style={{ whiteSpace: "nowrap" }}>.localhost:3000</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label className="label">Website</label>
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="goscore.io" />
        </div>
      </div>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="label">Industry</label>
          <select className="select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option>Software</option><option>Fintech</option><option>Healthcare</option><option>Consumer</option><option>Hardware</option><option>Other</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="label">Team size</label>
          <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
            <option>1–10</option><option>11–50</option><option>51–200</option><option>201+</option>
          </select>
        </div>
      </div>

      <label className="row" style={{ gap: 10 }}>
        <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
        <span className="tiny">Seed with example jobs and candidates (recommended for a first look)</span>
      </label>

      {error && <div className="chip chip-danger" style={{ height: "auto", padding: "8px 12px", borderRadius: 10 }}>{error}</div>}

      <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !name.trim() || !slug.trim()}>
        {busy ? "Creating…" : "Create workspace"} <Icons.ArrowRight size={14} stroke={2} />
      </button>
    </form>
  );
}
