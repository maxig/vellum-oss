// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * InterviewKitsTab — Settings → Interview kits.
 *
 * Admin-managed scorecard templates. Each kit is a named set of criteria
 * (rating / text / yes-no) optionally tied to a pipeline stage. Interviewers
 * fill one in from the candidate drawer's Evaluation tab; the answers snapshot
 * onto the InterviewDebrief. Self-contained: fetches + mutates
 * /api/interview-kits directly (gated admin-only server-side).
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Glass, Icons } from "@/components/primitives";

type KitItem = { id: string; label: string; hint: string | null; kind: string };
type Kit = { id: string; name: string; description: string | null; stageKey: string | null; archived: boolean; items: KitItem[] };
type StageOpt = { key: string; name: string };

// Labels: common.criterionKinds.<kind>
const KINDS = ["rating", "text", "yesno"] as const;

type DraftItem = { label: string; hint: string; kind: string };
type Draft = { id: string | null; name: string; description: string; stageKey: string; items: DraftItem[] };
const blankItem = (): DraftItem => ({ label: "", hint: "", kind: "rating" });
const emptyDraft = (): Draft => ({ id: null, name: "", description: "", stageKey: "", items: [blankItem()] });

export default function InterviewKitsTab() {
  const t = useTranslations("settings.kits");
  const tc = useTranslations("common");
  const [kits, setKits] = React.useState<Kit[] | null>(null);
  const [stages, setStages] = React.useState<StageOpt[]>([]);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/interview-kits", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json().catch(() => null);
    if (!json) return;
    setKits(json.kits || []);
    setStages(json.stages || []);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setError(null);
    setDraft(emptyDraft());
  }
  function startEdit(k: Kit) {
    setError(null);
    setDraft({
      id: k.id,
      name: k.name,
      description: k.description || "",
      stageKey: k.stageKey || "",
      items: k.items.length ? k.items.map((it) => ({ label: it.label, hint: it.hint || "", kind: it.kind })) : [blankItem()],
    });
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function patchItem(i: number, patch: Partial<DraftItem>) {
    setDraft((d) => (d ? { ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) } : d));
  }
  function addItem() {
    setDraft((d) => (d ? { ...d, items: [...d.items, blankItem()] } : d));
  }
  function removeItem(i: number) {
    setDraft((d) => (d ? { ...d, items: d.items.filter((_, idx) => idx !== i) } : d));
  }
  function moveItem(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.items.length) return d;
      const items = [...d.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...d, items };
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError(t("errors.name"));
      return;
    }
    const items = draft.items
      .map((it) => ({ label: it.label.trim(), hint: it.hint.trim() || null, kind: it.kind }))
      .filter((it) => it.label);
    if (items.length === 0) {
      setError(t("errors.criteria"));
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { name: draft.name.trim(), description: draft.description.trim() || null, stageKey: draft.stageKey || null, items };
    const res = await fetch(draft.id ? `/api/interview-kits/${draft.id}` : "/api/interview-kits", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError(t("errors.save"));
      return;
    }
    setDraft(null);
    load();
  }

  async function remove(k: Kit) {
    if (!window.confirm(t("confirmDelete", { name: k.name }))) return;
    const res = await fetch(`/api/interview-kits/${k.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      if (draft?.id === k.id) setDraft(null);
      load();
    }
  }

  const stageName = (key: string | null) => (key ? stages.find((s) => s.key === key)?.name || key : null);

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("title")}</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              {t("hint")}
            </p>
          </div>
          {!draft && (
            <button className="btn btn-sm btn-primary" onClick={startNew}>
              <Icons.Plus size={13} /> {t("new")}
            </button>
          )}
        </div>
      </Glass>

      {draft && (
        <Glass className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 14 }}>{draft.id ? t("edit") : t("newTitle")}</h2>

          <div className="row" style={{ gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label className="label">{t("name")}</label>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                placeholder={t("namePlaceholder")}
                autoFocus
              />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="label">{t("stage")}</label>
              <select className="select" value={draft.stageKey} onChange={(e) => patchDraft({ stageKey: e.target.value })}>
                <option value="">{t("anyStage")}</option>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="label">{t("description")} <span className="muted">({tc("optional")})</span></label>
            <input
              className="input"
              value={draft.description}
              onChange={(e) => patchDraft({ description: e.target.value })}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>

          <label className="label">{t("criteria")}</label>
          <div className="col" style={{ gap: 8, marginBottom: 12 }}>
            {draft.items.map((it, i) => (
              <Glass faint key={i} style={{ padding: 10, borderRadius: 10 }}>
                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <div className="col" style={{ gap: 2, paddingTop: 2 }}>
                    <button className="iconbtn" style={{ width: 22, height: 18 }} onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label={t("moveUp")} title={t("moveUp")}>
                      <Icons.ChevronUp size={13} />
                    </button>
                    <button className="iconbtn" style={{ width: 22, height: 18 }} onClick={() => moveItem(i, 1)} disabled={i === draft.items.length - 1} aria-label={t("moveDown")} title={t("moveDown")}>
                      <Icons.ChevronDown size={13} />
                    </button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <input
                        className="input"
                        style={{ flex: 1 }}
                        value={it.label}
                        onChange={(e) => patchItem(i, { label: e.target.value })}
                        placeholder={t("criterionPlaceholder", { n: i + 1 })}
                      />
                      <select
                        className="select"
                        style={{ width: 130 }}
                        value={it.kind}
                        onChange={(e) => patchItem(i, { kind: e.target.value })}
                        aria-label={t("criterionType")}
                      >
                        {KINDS.map((k) => (
                          <option key={k} value={k}>{tc(`criterionKinds.${k}`)}</option>
                        ))}
                      </select>
                      <button
                        className="iconbtn"
                        onClick={() => removeItem(i)}
                        disabled={draft.items.length === 1}
                        aria-label={t("removeCriterion")}
                        title={tc("remove")}
                        style={{ color: "var(--ink-2)" }}
                      >
                        <Icons.Trash size={13} />
                      </button>
                    </div>
                    <input
                      className="input"
                      style={{ marginTop: 6, fontSize: 12.5, height: 30 }}
                      value={it.hint}
                      onChange={(e) => patchItem(i, { hint: e.target.value })}
                      placeholder={t("guidance")}
                    />
                  </div>
                </div>
              </Glass>
            ))}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={addItem} style={{ marginBottom: 16 }}>
            <Icons.Plus size={12} /> {t("addCriterion")}
          </button>

          {error && (
            <div className="chip chip-danger" style={{ display: "inline-flex", padding: "6px 12px", height: "auto", marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-sm" onClick={() => setDraft(null)} disabled={saving}>
              {tc("cancel")}
            </button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
              <Icons.Check size={12} stroke={2} /> {saving ? tc("saving") : draft.id ? t("save") : t("create")}
            </button>
          </div>
        </Glass>
      )}

      <Glass className="card" style={{ padding: kits && kits.length === 0 && !draft ? 24 : 8 }}>
        {kits === null ? (
          <div style={{ padding: 16 }}>
            <div className="ai-shimmer" style={{ height: 56, borderRadius: 10, marginBottom: 8 }} />
            <div className="ai-shimmer" style={{ height: 56, borderRadius: 10 }} />
          </div>
        ) : kits.length === 0 ? (
          !draft && (
            <div style={{ textAlign: "center", padding: "20px 8px" }}>
              <p className="muted" style={{ marginBottom: 12 }}>{t("empty")}</p>
              <button className="btn btn-sm btn-primary" onClick={startNew}>
                <Icons.Plus size={13} /> {t("createFirst")}
              </button>
            </div>
          )
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {kits.map((k) => (
              <div key={k.id} className="row" style={{ gap: 12, padding: "10px 14px", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 550 }}>{k.name}</span>
                    {stageName(k.stageKey) ? (
                      <span className="chip" style={{ height: 20, fontSize: 11 }}>{stageName(k.stageKey)}</span>
                    ) : (
                      <span className="chip" style={{ height: 20, fontSize: 11, opacity: 0.7 }}>{t("general")}</span>
                    )}
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    {t("criteriaCount", { count: k.items.length })}
                    {k.items.length > 0 && (
                      <span className="muted"> · {k.items.slice(0, 4).map((it) => it.label).join(", ")}{k.items.length > 4 ? "…" : ""}</span>
                    )}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => startEdit(k)}>{tc("edit")}</button>
                <button className="iconbtn" onClick={() => remove(k)} aria-label={t("deleteLabel", { name: k.name })} title={tc("delete")} style={{ color: "var(--ink-2)" }}>
                  <Icons.Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Glass>
    </>
  );
}
