// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useValueLabels } from "@/i18n/labels";
import { Glass, Chip, AIPill, Icons } from "@/components/primitives";
import Wysiwyg from "@/components/Wysiwyg";
import { currencySymbol } from "@/lib/utils";
import { markdownToHtml } from "@/lib/markdown";
import { logger } from "@/lib/log";

const log = logger("job-wizard");

// `options` are the stored values; `labels` maps them to display text.
function Segmented({ value, onChange, options, labels, size = "md" }: { value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>; size?: "sm" | "md" }) {
  const small = size === "sm";
  return (
    <div style={{
      display: "inline-flex", gap: 2,
      padding: 2,
      borderRadius: 8,
      background: "var(--glass-bg-faint)",
      border: "0.5px solid var(--line)",
    }}>
      {options.map(o => (
        <button key={o}
                type="button"
                onClick={() => onChange(o)}
                className="btn btn-ghost"
                style={{
                  height: small ? 22 : 28,
                  padding: small ? "0 9px" : "0 12px",
                  fontSize: small ? 11.5 : 12.5,
                  borderRadius: 6,
                  border: "0.5px solid transparent",
                  background: value === o ? "var(--glass-bg-strong)" : "transparent",
                  boxShadow: value === o ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  borderColor: value === o ? "var(--glass-border)" : "transparent",
                  color: value === o ? "var(--ink-0)" : "var(--ink-2)",
                  textTransform: labels ? "none" : "capitalize"
                }}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row" style={{ marginBottom: 6, gap: 8 }}>
        <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", whiteSpace: "nowrap" }}>{label}</label>
        {hint && <span className="tiny" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const STEPS = ["basics", "describe", "screen", "publish"] as const;

export default function JobWizardModal({
  departments,
  locations,
  currency,
  onClose,
  onDone,
}: {
  departments: string[];
  locations: string[];
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("jobs.wizard");
  const tc = useTranslations("common");
  const labels = useValueLabels();
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<{ q: string; type: string; reason: string }[]>([]);
  const [suggestionsBusy, setSuggestionsBusy] = React.useState(false);

  const [form, setForm] = React.useState({
    title: "",
    department: departments[0] || "",
    location: locations[0] || "Remote",
    workmode: "Remote",
    employment: "Full-time",
    pitch: "",
    description: "",
    requirements: "",
    niceToHave: "",
    salaryMin: "" as number | "",
    salaryMax: "" as number | "",
    questions: [] as { q: string; required: boolean; type: string }[],
    publishCareer: true,
    publishLinkedin: true,
    publishIndeed: false,
  });

  // Ensure default values are picked up if props change or on first mount
  // while keeping local state in sync.
  React.useEffect(() => {
    if (!form.department && departments.length > 0) {
      set("department", departments[0]);
    }
    if ((form.location === "Remote" || !form.location) && locations.length > 0) {
      // If we have specific locations but current is default "Remote" (and "Remote" is not in options),
      // pick the first one.
      if (!locations.includes(form.location)) {
        set("location", locations[0]);
      }
    }
  }, [departments, locations]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const [tone, setTone] = React.useState("Warm");
  const [aiPrompt, setAiPrompt] = React.useState("");
  const sym = currencySymbol(currency).trim();

  // Fetch screening questions suggestions when landing on Step 2
  React.useEffect(() => {
    if (step === 2 && suggestions.length === 0 && !suggestionsBusy) {
      fetchSuggestions();
    }
  }, [step]);

  async function fetchSuggestions() {
    setSuggestionsBusy(true);
    try {
      const r = await fetch("/api/ai/suggest-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          requirements: form.requirements.split("\n").map((s) => s.trim()).filter(Boolean),
          niceToHave: form.niceToHave.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j.suggestions) setSuggestions(j.suggestions);
    } catch (e) {
      log.warn("Failed to fetch suggestions:", e);
    } finally {
      setSuggestionsBusy(false);
    }
  }

  async function aiGenerate() {
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/generate-job-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, prompt: aiPrompt, tone }),
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j.pitch) set("pitch", j.pitch);
      if (j.description) set("description", markdownToHtml(j.description));
      if (j.requirements) set("requirements", Array.isArray(j.requirements) ? j.requirements.join("\n") : j.requirements);
      if (j.niceToHave) set("niceToHave", Array.isArray(j.niceToHave) ? j.niceToHave.join("\n") : j.niceToHave);
    } finally {
      setAiBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    const body = {
      title: form.title,
      department: form.department,
      location: form.location,
      employment: form.employment,
      pitch: form.pitch,
      description: form.description,
      requirements: form.requirements.split("\n").map((s) => s.trim()).filter(Boolean),
      niceToHave: form.niceToHave.split("\n").map((s) => s.trim()).filter(Boolean),
      salaryMin: form.salaryMin || null,
      salaryMax: form.salaryMax || null,
      publish: form.publishCareer,
      // Note: screening questions and other publish channels would need API support
      screeningQuestions: form.questions,
    };
    const r = await fetch("/api/jobs", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) return;
    onDone();
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet glass glass-strong" style={{ width: 880, height: "min(840px, 90vh)" }}>
        <div className="sheet-hd">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="topbar-crumb">{t("crumb")}</div>
            <div className="topbar-title">{t("title")}</div>
          </div>
          <div className="wiz-steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`wiz-step ${i === step ? "active" : i < step ? "done" : ""}`} onClick={() => i <= step && setStep(i)}>
                <span className="wiz-step-n">{i < step ? <Icons.Check size={11} stroke={2.4}/> : i + 1}</span>
                {t(`steps.${s}`)}
              </div>
            ))}
          </div>
          <button className="iconbtn" onClick={onClose} aria-label={tc("close")}><Icons.X size={15}/></button>
        </div>

        <div className="sheet-body scroll" style={{ display: "block", padding: "26px 30px" }}>
          {step === 0 && (
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{t("basics.title")}</h2>
              <p style={{ marginBottom: 24 }}>{t("basics.hint")}</p>

              <Row label={t("basics.jobTitle")}>
                <input className="input" placeholder={t("basics.jobTitlePlaceholder")}
                       value={form.title} onChange={e => set("title", e.target.value)} autoFocus />
              </Row>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Row
                  label={t("basics.department")}
                  hint={
                    departments.length === 0 ? (
                      <a href="/settings?tab=workspace" onClick={onClose} className="tiny accent" style={{ fontWeight: 500 }}>
                        {t("basics.addInSettings")}
                      </a>
                    ) : undefined
                  }
                >
                  {departments.length > 0 ? (
                    <select
                      className="select"
                      value={form.department}
                      onChange={(e) => set("department", e.target.value)}
                    >
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      value={form.department}
                      onChange={(e) => set("department", e.target.value)}
                      placeholder={t("basics.departmentPlaceholder")}
                    />
                  )}
                </Row>
                <Row label={t("basics.workMode")}>
                  <Segmented
                    value={form.workmode}
                    onChange={(v) => set("workmode", v)}
                    options={["Remote", "Hybrid", "On-site"]}
                    labels={{ Remote: tc("workModes.remote"), Hybrid: tc("workModes.hybrid"), "On-site": tc("workModes.onsite") }}
                  />
                </Row>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Row
                  label={t("basics.location")}
                  hint={
                    locations.length <= 1 ? ( // Only "Remote" or empty
                      <a href="/settings?tab=career" onClick={onClose} className="tiny accent" style={{ fontWeight: 500 }}>
                        {t("basics.addOffice")}
                      </a>
                    ) : undefined
                  }
                >
                  {locations.length > 0 ? (
                    <select
                      className="select"
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                    >
                      {locations.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      placeholder={t("basics.locationPlaceholder")}
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                    />
                  )}
                </Row>
                <Row label={t("basics.salary")} hint={t("basics.salaryHint", { symbol: sym })}>
                  <div className="row" style={{ gap: 8 }}>
                    <input className="input" type="number" placeholder={t("basics.min")} value={form.salaryMin} onChange={(e) => set("salaryMin", e.target.valueAsNumber || "")} />
                    <span className="muted">{t("basics.to")}</span>
                    <input className="input" type="number" placeholder={t("basics.max")} value={form.salaryMax} onChange={(e) => set("salaryMax", e.target.valueAsNumber || "")} />
                  </div>
                </Row>
              </div>

              <Row label={t("basics.employment")}>
                <Segmented value={form.employment} onChange={v => set("employment", v)}
                           options={["Full-time", "Part-time", "Contract", "Internship"]}
                           labels={{ "Full-time": tc("employment.fullTime"), "Part-time": tc("employment.partTime"), Contract: tc("employment.contract"), Internship: tc("employment.internship") }} />
              </Row>
            </div>
          )}

          {step === 1 && (
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{t("describe.title")}</h2>
              <p style={{ marginBottom: 22 }}>{t("describe.hint")}</p>

              <Glass faint style={{ padding: 16, borderRadius: 14, marginBottom: 22 }}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <AIPill>{t("describe.aiDraft")}</AIPill>
                  <span style={{ flex: 1 }} />
                  <span className="tiny" style={{ marginRight: 8 }}>{t("describe.tone")}</span>
                  <Segmented value={tone} onChange={setTone} options={["Direct", "Warm", "Bold"]} labels={{ Direct: t("describe.tones.direct"), Warm: t("describe.tones.warm"), Bold: t("describe.tones.bold") }} size="sm" />
                </div>
                <textarea
                  className="input"
                  rows={2}
                  placeholder={t("describe.promptPlaceholder")}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  style={{ marginBottom: 10, height: "auto", padding: "10px 12px" }}
                />
                <button className="btn btn-sm btn-primary" type="button" onClick={aiGenerate} disabled={aiBusy}>
                  <Icons.Sparkle size={12} stroke={2} /> {aiBusy ? t("describe.generating") : t("describe.generate")}
                </button>
              </Glass>

              <Row label={t("describe.pitch")} hint={t("describe.pitchHint")}>
                <input className="input" value={form.pitch} onChange={(e) => set("pitch", e.target.value)} placeholder={t("describe.pitchPlaceholder")}/>
              </Row>

              <Row label={t("describe.description")} hint={aiBusy ? t("describe.generating") : ""}>
                <div style={{ position: "relative" }}>
                  <Wysiwyg
                    value={form.description}
                    onChange={(v) => set("description", v)}
                    placeholder={t("describe.descriptionPlaceholder")}
                    minHeight={220}
                  />
                  {aiBusy && <div className="ai-shimmer" style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 10 }} />}
                </div>
              </Row>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Row label={t("describe.requirements")}>
                  <div style={{ position: "relative" }}>
                    <textarea className="textarea autogrow" data-max-lines="12"
                              value={form.requirements}
                              onChange={e => set("requirements", e.target.value)}
                              placeholder={t("describe.requirementsPlaceholder")} />
                    {aiBusy && <div className="ai-shimmer" style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 10 }} />}
                  </div>
                </Row>
                <Row label={t("describe.niceToHave")}>
                  <div style={{ position: "relative" }}>
                    <textarea className="textarea autogrow" data-max-lines="12"
                              value={form.niceToHave}
                              onChange={e => set("niceToHave", e.target.value)}
                              placeholder={t("describe.niceToHavePlaceholder")} />
                    {aiBusy && <div className="ai-shimmer" style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 10 }} />}
                  </div>
                </Row>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{t("screen.title")}</h2>
              <p style={{ marginBottom: 22 }}>{t("screen.hint")}</p>

              <div className="col" style={{ gap: 10 }}>
                {form.questions.map((q, i) => (
                  <Glass faint key={i} style={{ padding: 14, borderRadius: 12 }}>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <span className="chip mono" style={{ height: 20, fontSize: 11 }}>Q{i + 1}</span>
                      <Segmented value={q.type} onChange={v => set("questions", form.questions.map((item, j) => j === i ? { ...item, type: v } : item))} options={["short", "long", "yes/no"]} labels={{ short: t("screen.types.short"), long: t("screen.types.long"), "yes/no": t("screen.types.yesno") }} size="sm" />
                      <span style={{ flex: 1 }} />
                      <div className="row" style={{ gap: 6 }}>
                        <span className="tiny">{t("screen.required")}</span>
                        <button
                          type="button"
                          className={`switch ${q.required ? "on" : ""}`}
                          onClick={() => set("questions", form.questions.map((item, j) => j === i ? { ...item, required: !item.required } : item))}
                        />
                      </div>
                      <button className="iconbtn" style={{ width: 26, height: 26 }} onClick={() => set("questions", form.questions.filter((_, j) => j !== i))}><Icons.X size={13}/></button>
                    </div>
                    <input className="input" placeholder={t("screen.questionPlaceholder")}
                           value={q.q} onChange={e => set("questions", form.questions.map((item, j) => j === i ? { ...item, q: e.target.value } : item))} />
                  </Glass>
                ))}
              </div>

              <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => set("questions", [...form.questions, { q: "", required: false, type: "short" }])}><Icons.Plus size={13}/> {t("screen.add")}</button>

              {(suggestionsBusy || suggestions.length > 0) && (
                <div style={{ marginTop: 32 }}>
                  <div className="row" style={{ marginBottom: 12, gap: 8 }}>
                    <AIPill>{t("screen.suggestions")}</AIPill>
                    {suggestionsBusy && <span className="tiny muted ai-shimmer-text">{t("screen.suggesting")}</span>}
                  </div>
                  
                  <div className="col" style={{ gap: 10 }}>
                    {suggestionsBusy ? (
                      [1, 2, 3].map(i => (
                        <Glass key={i} faint style={{ padding: 14, borderRadius: 12, height: 80 }} className="ai-shimmer" />
                      ))
                    ) : (
                      suggestions.map((s, i) => (
                        <Glass key={i} style={{ 
                          padding: 16, 
                          borderRadius: 14, 
                          background: "linear-gradient(160deg, color-mix(in oklab, var(--accent-1) 10%, var(--glass-bg)), color-mix(in oklab, var(--accent-2) 8%, var(--glass-bg)))",
                          border: "0.5px solid var(--line)"
                        }}>
                          <div style={{ fontSize: 13, color: "var(--ink-0)", fontWeight: 500, marginBottom: 4, lineHeight: 1.5 }}>
                            {s.q}
                          </div>
                          <div className="row" style={{ gap: 12 }}>
                            <div className="tiny muted" style={{ flex: 1 }}>{s.reason}</div>
                            <button className="btn btn-xs btn-primary" type="button" onClick={() => {
                              set("questions", [...form.questions, { q: s.q, required: false, type: s.type }]);
                              setSuggestions(suggestions.filter((_, j) => j !== i));
                            }}>
                              {tc("add")} <Icons.Plus size={11} stroke={2.5} />
                            </button>
                          </div>
                        </Glass>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{t("publish.title")}</h2>
              <p style={{ marginBottom: 22 }}>{t("publish.hint")}</p>

              <div className="col" style={{ gap: 10, marginBottom: 22 }}>
                <PublishRow icon="Globe" name={t("publish.careers")} sub={t("publish.careersSub")}
                            on={form.publishCareer} onToggle={() => set("publishCareer", !form.publishCareer)} />
                <PublishRow icon="Linkedin" name="LinkedIn Jobs" sub={t("publish.linkedinSub")}
                            on={form.publishLinkedin} onToggle={() => set("publishLinkedin", !form.publishLinkedin)} />
                <PublishRow icon="Briefcase" name="Indeed" sub={t("publish.indeedSub")}
                            on={form.publishIndeed} onToggle={() => set("publishIndeed", !form.publishIndeed)} />
              </div>

              <Glass faint style={{ padding: 18, borderRadius: 12 }}>
                <div className="section-h" style={{ marginBottom: 8 }}>{t("publish.preview")}</div>
                <div className="row" style={{ marginBottom: 8 }}>
                  <div className="gs-mark" style={{ width: 22, height: 22 }} />
                  <span className="tiny">{t("publish.previewBrand")}</span>
                </div>
                <h3 style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{form.title || t("basics.jobTitleExample")}</h3>
                <div className="tiny" style={{ marginTop: 4 }}>
                  {form.department} · {form.location || tc("workModes.remote")} · {labels.workMode(form.workmode)}
                  {(form.salaryMin || form.salaryMax) && <> · {sym}{form.salaryMin}{form.salaryMax && ` – ${sym}${form.salaryMax}`}</>}
                </div>
                <div
                  style={{ marginTop: 12, fontSize: 13, color: "var(--ink-1)", lineHeight: 1.55, maxHeight: 120, overflow: "hidden", maskImage: "linear-gradient(to bottom, black 60%, transparent)" }}
                  dangerouslySetInnerHTML={{ __html: form.description || t("publish.descriptionPlaceholder") }}
                />
              </Glass>
            </div>
          )}
        </div>

        <div className="row" style={{ padding: "12px 22px", borderTop: "0.5px solid var(--line)", background: "var(--glass-bg)" }}>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>{tc("cancel")}</button>
          <span style={{ flex: 1 }} />
          {step > 0 && <button className="btn btn-sm" onClick={() => setStep(step - 1)}><Icons.ChevronLeft size={12}/> {tc("back")}</button>}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-sm btn-primary" onClick={() => setStep(step + 1)} disabled={step === 0 && !form.title.trim()}>{t("continue")} <Icons.ChevronRight size={12} stroke={2}/></button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={submit} disabled={busy}>
              {busy ? t("publishing") : form.publishCareer ? t("publishJob") : t("saveDraft")} <Icons.ArrowUpRight size={12} stroke={2}/>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function PublishRow({ icon, name, sub, on, onToggle }: { icon: keyof typeof Icons; name: string; sub: string; on: boolean; onToggle: () => void }) {
  const I = Icons[icon];
  return (
    <Glass faint style={{ padding: 14, borderRadius: 12, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--glass-bg)", border: "0.5px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-1)" }}>
        <I size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{name}</div>
        <div className="tiny">{sub}</div>
      </div>
      <button type="button" className={`switch ${on ? "on" : ""}`} onClick={onToggle} />
    </Glass>
  );
}
