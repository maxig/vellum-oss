// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Icons } from "@/components/Icons";
import Wysiwyg from "@/components/Wysiwyg";

export default function ApplyForm({
  workspaceSlug, jobSlug, jobId, screening,
}: {
  workspaceSlug: string;
  jobSlug: string;
  jobId: string;
  screening: { id: string; label: string; kind: string; required: boolean }[];
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [linkedin, setLinkedin] = React.useState("");
  const [portfolio, setPortfolio] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [whyUs, setWhyUs] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    // Check required screening questions
    for (const q of screening) {
      if (q.required) {
        const answer = (answers[q.id] || "").trim();
        // For HTML fields, we need to strip tags to see if there's actual text
        const text = answer.replace(/<[^>]*>/g, "").trim();
        if (!text && !answer) {
          setError(`Please answer the required question: "${q.label}"`);
          return;
        }
      }
    }

    if (!consent) { setError("Please accept the data processing notice."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.append("jobId", jobId);
    fd.append("name", name);
    fd.append("email", email);
    fd.append("linkedin", linkedin);
    fd.append("portfolio", portfolio);
    fd.append("location", location);
    fd.append("whyUs", whyUs);
    fd.append("screeningAnswers", JSON.stringify(answers));
    if (file) fd.append("resume", file);
    const r = await fetch("/api/public/apply", { method: "POST", body: fd });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error || "Could not submit. Please try again.");
      return;
    }
    window.location.href = `/jobs/${jobSlug}/apply?done=1`;
  }

  return (
    <form onSubmit={submit} className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ flex: 1 }}><label className="label">Full name *</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label className="label">Email *</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ flex: 1 }}><label className="label">LinkedIn</label><input className="input" placeholder="https://linkedin.com/in/…" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label className="label">Portfolio / website</label><input className="input" placeholder="https://" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} /></div>
      </div>
      <div><label className="label">Location</label><input className="input" placeholder="City, country" value={location} onChange={(e) => setLocation(e.target.value)} /></div>

      <div>
        <label className="label">Resume / CV (PDF)</label>
        <label className="card-faint" style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, border: "1px dashed var(--line-strong)", cursor: "pointer" }}>
          <Icons.Upload size={16} />
          <div style={{ flex: 1, fontSize: 13 }}>{file ? file.name : "Click or drag to upload"}</div>
          <input type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>

      <div>
        <label className="label">Why us?</label>
        <Wysiwyg
          value={whyUs}
          onChange={setWhyUs}
          placeholder="Tell us what drew you here, and what kind of work you'd love to do."
          minHeight={140}
        />
      </div>

      {screening.map((q) => (
        <div key={q.id}>
          <label className="label">{q.label} {q.required && "*"}</label>
          {q.kind === "longtext" ? (
            <Wysiwyg
              value={answers[q.id] || ""}
              onChange={(html) => setAnswers({ ...answers, [q.id]: html })}
              minHeight={90}
            />
          ) : q.kind === "yesno" ? (
            <div className="row" style={{ gap: 8 }}>
              {["Yes", "No"].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`btn btn-sm ${answers[q.id] === v ? "btn-primary" : ""}`}
                  onClick={() => setAnswers({ ...answers, [q.id]: v })}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <input className="input" type={q.kind === "number" ? "number" : "text"} required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
          )}
        </div>
      ))}

      <label className="row" style={{ gap: 10, alignItems: "flex-start", marginTop: 10 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4 }} />
        <span className="tiny" style={{ lineHeight: 1.5 }}>
          I consent to have my application data stored and reviewed for this role. I can request deletion at any time by emailing the hiring team.
        </span>
      </label>

      {error && <div className="chip chip-danger" style={{ height: "auto", padding: "8px 12px", borderRadius: 10 }}>{error}</div>}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}
