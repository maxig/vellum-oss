// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Glass, Chip, AIPill, Icons } from "@/components/primitives";
import Wysiwyg from "@/components/Wysiwyg";
import { currencySymbol } from "@/lib/utils";
import { markdownToHtml } from "@/lib/markdown";

const STEPS = ["Basics", "Description", "Process", "Publish"] as const;

export default function JobWizard({
  departments,
  locations,
  currency,
}: {
  departments: string[];
  locations: string[];
  currency: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [department, setDepartment] = React.useState(departments[0] || "");
  const [location, setLocation] = React.useState(locations[0] || "Remote");
  const [employment, setEmployment] = React.useState("Full-time");
  const [pitch, setPitch] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [requirements, setRequirements] = React.useState("");
  const [niceToHave, setNiceToHave] = React.useState("");
  const [salaryMin, setSalaryMin] = React.useState<number | "">("");
  const [salaryMax, setSalaryMax] = React.useState<number | "">("");
  const [publish, setPublish] = React.useState(true);
  const sym = currencySymbol(currency).trim();

  async function aiRewrite() {
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/rewrite-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, rough: description || pitch }),
      });
      const j = await r.json();
      // AI returns markdown for prose output; convert to HTML so the Wysiwyg
      // editor renders it as formatted text rather than literal `**asterisks**`.
      if (j.text) setDescription(markdownToHtml(j.text));
    } finally {
      setAiBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    const body = {
      title,
      department,
      location,
      employment,
      pitch,
      description,
      requirements: requirements.split("\n").map((s) => s.trim()).filter(Boolean),
      niceToHave: niceToHave.split("\n").map((s) => s.trim()).filter(Boolean),
      salaryMin: salaryMin || null,
      salaryMax: salaryMax || null,
      publish,
    };
    const r = await fetch("/api/jobs", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) return;
    const j = await r.json();
    router.push(`/jobs/${j.id}`);
  }

  return (
    <Glass className="card" style={{ padding: 28 }}>
      <div className="wiz-steps" style={{ marginBottom: 22 }}>
        {STEPS.map((s, i) => (
          <div key={s} className={`wiz-step ${i === step ? "active" : i < step ? "done" : ""}`} onClick={() => i <= step && setStep(i)}>
            <div className="wiz-step-n">{i < step ? "✓" : i + 1}</div>
            {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="col" style={{ gap: 14 }}>
          <div><label className="label">Job title</label><input className="input" placeholder="Senior Product Designer" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus/></div>
          <div className="row" style={{ gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Department</label>
              {departments.length > 0 ? (
                <select className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : (
                <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Location</label>
              <select className="select" value={location} onChange={(e) => setLocation(e.target.value)}>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <p className="tiny muted" style={{ marginTop: 4 }}>
                Pulled from your offices. <a href="/settings?tab=career" style={{ color: "var(--accent-solid)" }}>Manage</a>
              </p>
            </div>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <div style={{ flex: 1 }}><label className="label">Employment</label>
              <select className="select" value={employment} onChange={(e) => setEmployment(e.target.value)}>
                <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Salary min ({sym})</label>
              <input className="input" type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.valueAsNumber || "")} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Salary max ({sym})</label>
              <input className="input" type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.valueAsNumber || "")} />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="col" style={{ gap: 14 }}>
          <div><label className="label">Pitch <span className="tiny muted">one line that hooks readers</span></label>
            <input className="input" value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="Help us make lending feel obvious."/>
          </div>
          <div>
            <div className="row"><label className="label" style={{ flex: 1, marginBottom: 0 }}>Description</label>
              <button className="btn btn-sm" type="button" disabled={aiBusy} onClick={aiRewrite}>
                <AIPill>{aiBusy ? "Rewriting…" : "AI rewrite"}</AIPill>
              </button>
            </div>
            <Wysiwyg
              value={description}
              onChange={setDescription}
              placeholder="What the role is, what you'll work on, and why someone should care."
              minHeight={220}
            />
          </div>
          <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <label className="label">Requirements (one per line)</label>
              <textarea className="textarea autogrow" data-max-lines="12" value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="5+ years designing complex B2B / fintech / data products"/>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Nice to have</label>
              <textarea className="textarea autogrow" data-max-lines="12" value={niceToHave} onChange={(e) => setNiceToHave(e.target.value)} placeholder="Background in regulated industries"/>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Default hiring process</h3>
          <p className="muted" style={{ marginBottom: 16 }}>You can customise this later under the job's Hiring team tab.</p>
          <ol style={{ paddingLeft: 18, color: "var(--ink-1)", lineHeight: 1.7 }}>
            <li>Intro chat · 30 min with you</li>
            <li>Working session · 60 min with hiring manager</li>
            <li>Team meet · 60 min</li>
            <li>Offer · Within a week</li>
          </ol>
        </div>
      )}

      {step === 3 && (
        <div className="col" style={{ gap: 14 }}>
          <h3>Ready to publish?</h3>
          <p className="muted">Publishing makes the role public on your career site at the workspace's URL.</p>
          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <span>Publish immediately</span>
          </label>
          {!publish && <Chip warn dot>Will be saved as Draft</Chip>}
        </div>
      )}

      <div className="row" style={{ marginTop: 24, gap: 8 }}>
        <button className="btn btn-ghost" type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <Icons.ChevronLeft size={13}/> Back
        </button>
        <div style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" type="button" disabled={step === 0 && !title.trim()} onClick={() => setStep((s) => s + 1)}>
            Next <Icons.ArrowRight size={13}/>
          </button>
        ) : (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={submit}>
            {busy ? "Creating…" : publish ? "Publish job" : "Save draft"}
          </button>
        )}
      </div>
    </Glass>
  );
}
