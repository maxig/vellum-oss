// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useValueLabels } from "@/i18n/labels";
import { Glass, Avatar, Chip, Icons } from "@/components/primitives";

export type UserProfileInitial = {
  id: string;
  name: string;
  email: string;
  title: string;
  pronouns: string;
  location: string;
  timezone: string;
  workingHours: string;
  bio: string;
  signature: string;
  role: string;
  joinedAt: string;
  notifications: NotificationPrefs;
};

type NotificationPrefs = {
  emailNewApplication: boolean;
  emailCandidateReply: boolean;
  emailMention: boolean;
  emailInterviewReminder: boolean;
  emailFollowedCandidate: boolean;
  emailWeeklyDigest: boolean;
  notifyTodoAssigned: boolean;
  pushDesktop: boolean;
  soundsOn: boolean;
  dnd: boolean;
};

const NOTIFICATION_DEFAULTS: NotificationPrefs = {
  emailNewApplication: true,
  emailCandidateReply: true,
  emailMention: true,
  emailInterviewReminder: true,
  emailFollowedCandidate: false,
  emailWeeklyDigest: true,
  notifyTodoAssigned: true,
  pushDesktop: false,
  soundsOn: true,
  dnd: false,
};

type Tab = "profile" | "stats" | "prefs" | "account";

export default function UserProfileSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: UserProfileInitial;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const labels = useValueLabels();
  const [tab, setTab] = React.useState<Tab>("profile");
  const [form, setForm] = React.useState({
    name: initial.name,
    title: initial.title,
    pronouns: initial.pronouns,
    email: initial.email,
    location: initial.location,
    timezone: initial.timezone,
    workingHours: initial.workingHours,
    bio: initial.bio,
    signature: initial.signature,
  });
  const [notif, setNotif] = React.useState<NotificationPrefs>({
    ...NOTIFICATION_DEFAULTS,
    ...initial.notifications,
  });
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setNotifKey = (k: keyof NotificationPrefs, v: boolean) =>
    setNotif((n) => ({ ...n, [k]: v }));

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((c) => (c === msg ? null : c)), 2400);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, notifications: notif }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      flash(t("saveFailed"));
      return;
    }
    flash(t("saved"));
    onSaved?.();
    onClose();
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div
        className="sheet glass glass-strong"
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogLabel")}
        style={{
          width: "min(720px, calc(100vw - 48px))",
          height: "auto",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Banner + avatar */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              height: 100,
              background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.25), transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,0,0,0.15), transparent 60%)",
              }}
            />
          </div>
          <button
            type="button"
            className="iconbtn"
            onClick={onClose}
            aria-label={tc("close")}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(0,0,0,0.2)",
              color: "white",
              backdropFilter: "blur(8px)",
            }}
          >
            <Icons.X size={15} />
          </button>
          <div style={{ padding: "0 24px", marginTop: -32, position: "relative" }}>
            <Avatar
              name={form.name || initial.email}
              size="xl"
              style={{
                boxShadow: "0 0 0 4px var(--bg-1), 0 8px 20px -6px rgba(20,20,50,0.2)",
                fontSize: 26,
              }}
            />
          </div>
        </div>

        <div style={{ padding: "14px 24px 8px" }}>
          <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 22, margin: 0 }}>{form.name || initial.email}</h2>
                {form.pronouns && (
                  <span className="chip" style={{ height: 20, fontSize: 11 }}>
                    {form.pronouns}
                  </span>
                )}
                <Chip accent>{labels.role(initial.role)}</Chip>
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>
                {form.title || "—"} · {t("joined", { date: initial.joinedAt })}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="row"
          style={{ padding: "0 24px", borderBottom: "0.5px solid var(--line)", gap: 4 }}
        >
          {(
            [
              { id: "profile" },
              { id: "stats" },
              { id: "prefs" },
              { id: "account" },
            ] as { id: Tab }[]
          ).map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              style={{
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 500,
                background: "transparent",
                border: 0,
                font: "inherit",
                color: tab === tb.id ? "var(--ink-0)" : "var(--ink-2)",
                borderBottom: tab === tb.id ? "1.5px solid var(--accent-solid)" : "1.5px solid transparent",
                marginBottom: "-0.5px",
                cursor: "default",
              }}
            >
              {t(`tabs.${tb.id}`)}
            </button>
          ))}
        </div>

        <div
          className="scroll"
          style={{ padding: "22px 24px", overflowY: "auto", minHeight: 0, flex: 1 }}
        >
          {tab === "profile" && (
            <div className="col" style={{ gap: 14 }}>
              <UPField label={t("fields.name")}>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </UPField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <UPField label={t("fields.title")}>
                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder={t("fields.titlePlaceholder")}
                  />
                </UPField>
                <UPField label={t("fields.pronouns")}>
                  <input
                    className="input"
                    value={form.pronouns}
                    onChange={(e) => set("pronouns", e.target.value)}
                    placeholder={t("fields.pronounsPlaceholder")}
                  />
                </UPField>
              </div>
              <UPField label={t("fields.email")} hint={t("fields.emailHint")}>
                <input
                  className="input"
                  value={form.email}
                  disabled
                  style={{ opacity: 0.7, cursor: "not-allowed" }}
                />
              </UPField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <UPField label={t("fields.location")}>
                  <input
                    className="input"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="Berlin, DE"
                  />
                </UPField>
                <UPField label={t("fields.timezone")}>
                  <input
                    className="input"
                    value={form.timezone}
                    onChange={(e) => set("timezone", e.target.value)}
                    placeholder="Europe/Berlin"
                    list="tz-suggestions"
                  />
                  <datalist id="tz-suggestions">
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz} />
                    ))}
                  </datalist>
                </UPField>
              </div>
              <UPField label={t("fields.workingHours")} hint={t("fields.workingHoursHint")}>
                <input
                  className="input"
                  value={form.workingHours}
                  onChange={(e) => set("workingHours", e.target.value)}
                  placeholder={t("fields.workingHoursPlaceholder")}
                />
              </UPField>
              <UPField label={t("fields.bio")}>
                <textarea
                  className="input autogrow"
                  data-max-lines="6"
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                  style={{ fontFamily: "inherit" }}
                />
              </UPField>
              <UPField label={t("fields.signature")} hint={t("fields.signatureHint")}>
                <textarea
                  className="input autogrow"
                  data-max-lines="6"
                  value={form.signature}
                  onChange={(e) => set("signature", e.target.value)}
                  style={{ fontFamily: "inherit" }}
                  placeholder={t("fields.signaturePlaceholder", { name: form.name || t("fields.yourName") })}
                />
              </UPField>
            </div>
          )}

          {tab === "stats" && <UserStats />}

          {tab === "prefs" && (
            <div className="col" style={{ gap: 0 }}>
              <h4 style={{ marginBottom: 8 }}>{t("notif.emailHeading")}</h4>
              <UPToggle
                title={t("notif.newApplication")}
                on={notif.emailNewApplication}
                onChange={(v) => setNotifKey("emailNewApplication", v)}
              />
              <UPToggle
                title={t("notif.candidateReply")}
                on={notif.emailCandidateReply}
                onChange={(v) => setNotifKey("emailCandidateReply", v)}
              />
              <UPToggle
                title={t("notif.mention")}
                on={notif.emailMention}
                onChange={(v) => setNotifKey("emailMention", v)}
              />
              <UPToggle
                title={t("notif.interviewReminder")}
                on={notif.emailInterviewReminder}
                onChange={(v) => setNotifKey("emailInterviewReminder", v)}
              />
              <UPToggle
                title={t("notif.followed")}
                on={notif.emailFollowedCandidate}
                onChange={(v) => setNotifKey("emailFollowedCandidate", v)}
              />
              <UPToggle
                title={t("notif.digest")}
                sub={t("notif.digestSub")}
                on={notif.emailWeeklyDigest}
                onChange={(v) => setNotifKey("emailWeeklyDigest", v)}
              />

              <h4 style={{ marginTop: 22, marginBottom: 8 }}>{t("notif.inAppHeading")}</h4>
              <UPToggle
                title={t("notif.todoAssigned")}
                sub={t("notif.todoAssignedSub")}
                on={notif.notifyTodoAssigned}
                onChange={(v) => setNotifKey("notifyTodoAssigned", v)}
              />
              <UPToggle
                title={t("notif.push")}
                on={notif.pushDesktop}
                onChange={(v) => setNotifKey("pushDesktop", v)}
              />
              <UPToggle
                title={t("notif.sounds")}
                on={notif.soundsOn}
                onChange={(v) => setNotifKey("soundsOn", v)}
              />
              <UPToggle
                title={t("notif.dnd")}
                sub={t("notif.dndSub")}
                on={notif.dnd}
                onChange={(v) => setNotifKey("dnd", v)}
              />
            </div>
          )}

          {tab === "account" && (
            <AccountTab onFlash={flash} />
          )}
        </div>

        {/* Footer */}
        <div
          className="row"
          style={{
            padding: "12px 22px",
            borderTop: "0.5px solid var(--line)",
            background: "var(--glass-bg)",
          }}
        >
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ color: "oklch(55% 0.18 28)" }}
          >
            <Icons.Logout size={12} /> {t("signOut")}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            {tc("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={save}
            disabled={saving || tab === "stats" || tab === "account"}
            title={tab === "stats" || tab === "account" ? t("noEditable") : undefined}
          >
            <Icons.Check size={12} stroke={2.4} /> {saving ? tc("saving") : t("saveChanges")}
          </button>
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          <Icons.Check size={14} style={{ color: "var(--accent-solid)" }} />
          {toast}
        </div>
      )}
    </>
  );
}

// ─── Stats tab ────────────────────────────────────────────────────────
type StatsPayload = {
  last30: {
    candidatesTouched: number;
    interviewsScheduled: number;
    replyWithin48hPct: number | null;
    replyDenominator: number;
  };
  thisWeek: {
    interviewsScheduled: number;
    repliesSent: number;
    medianReplyHours: number | null;
    stageMoves: number;
    stageMovesForward: number;
    stageMovesArchive: number;
    offerAccepted: { candidate: string; job: string } | null;
  };
};

function UserStats() {
  const t = useTranslations("profile.stats");
  const [data, setData] = React.useState<StatsPayload | null>(null);
  const [err, setErr] = React.useState(false);
  React.useEffect(() => {
    fetch("/api/profile/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  if (err) return <p className="muted">{t("loadFailed")}</p>;
  if (!data) {
    return (
      <div className="col" style={{ gap: 12 }}>
        <div className="ai-shimmer" style={{ height: 90, borderRadius: 10 }} />
        <div className="ai-shimmer" style={{ height: 180, borderRadius: 12 }} />
      </div>
    );
  }

  const { last30, thisWeek } = data;
  const replyValue =
    last30.replyWithin48hPct != null ? `${last30.replyWithin48hPct}%` : "—";

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <UserStat n={String(last30.candidatesTouched)} l={t("touched")} sub={t("last30")} />
        <UserStat n={String(last30.interviewsScheduled)} l={t("interviews")} sub={t("last30")} />
        <UserStat
          n={replyValue}
          l={t("reply48")}
          sub={last30.replyDenominator > 0 ? t("inbound30", { count: last30.replyDenominator }) : t("noInbound")}
        />
      </div>
      <Glass faint style={{ padding: 16, borderRadius: 12 }}>
        <h4 style={{ marginBottom: 12 }}>{t("thisWeek")}</h4>
        <div className="col" style={{ gap: 10 }}>
          <UpcomingItem
            icon="Calendar"
            t={t("interviewsScheduled", { count: thisWeek.interviewsScheduled })}
            sub={thisWeek.interviewsScheduled ? t("thisWeekLower") : t("noneYet")}
          />
          <UpcomingItem
            icon="Mail"
            t={t("repliesSent", { count: thisWeek.repliesSent })}
            sub={
              thisWeek.medianReplyHours != null
                ? t("medianResponse", { hours: thisWeek.medianReplyHours })
                : t("noReplies")
            }
          />
          <UpcomingItem
            icon="Pipeline"
            t={t("stageMoves", { count: thisWeek.stageMoves })}
            sub={t("stageMovesSub", { forward: thisWeek.stageMovesForward, archive: thisWeek.stageMovesArchive })}
          />
          {thisWeek.offerAccepted && (
            <UpcomingItem
              icon="Heart"
              t={t("offerAccepted")}
              sub={`${thisWeek.offerAccepted.candidate} · ${thisWeek.offerAccepted.job}`}
            />
          )}
        </div>
      </Glass>
    </div>
  );
}

function UserStat({ n, l, sub }: { n: string; l: string; sub: string }) {
  return (
    <Glass faint style={{ padding: 14, borderRadius: 10 }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em" }}>{n}</div>
      <div className="tiny" style={{ marginTop: 2, fontWeight: 500, color: "var(--ink-1)" }}>{l}</div>
      <div className="tiny" style={{ marginTop: 2 }}>{sub}</div>
    </Glass>
  );
}

function UpcomingItem({ icon, t, sub }: { icon: keyof typeof Icons; t: string; sub: string }) {
  const I = (Icons as any)[icon] || Icons.Sparkle;
  return (
    <div className="row" style={{ gap: 12 }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          background: "var(--glass-bg)",
          border: "0.5px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-solid)",
          flexShrink: 0,
        }}
      >
        <I size={12} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{t}</div>
        <div className="tiny">{sub}</div>
      </div>
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────
function AccountTab({ onFlash }: { onFlash: (msg: string) => void }) {
  const t = useTranslations("profile.account");
  const tc = useTranslations("common");
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function changePassword() {
    if (next.length < 6) {
      onFlash(t("tooShort"));
      return;
    }
    if (next !== confirm) {
      onFlash(t("mismatch"));
      return;
    }
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      onFlash(t("failed"));
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setOpen(false);
    onFlash(t("updated"));
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <Glass faint style={{ padding: 14, borderRadius: 10 }}>
        <h4 style={{ marginBottom: 4 }}>{t("password")}</h4>
        <p className="tiny" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          {t("passwordHint")}
        </p>
        {!open ? (
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            {t("change")}
          </button>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            <input
              className="input"
              type="password"
              placeholder={t("current")}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <input
              className="input"
              type="password"
              placeholder={t("new")}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="input"
              type="password"
              placeholder={t("confirm")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy || !next || next !== confirm}
                onClick={changePassword}
              >
                {busy ? t("updating") : t("update")}
              </button>
            </div>
          </div>
        )}
      </Glass>

      <Glass faint style={{ padding: 14, borderRadius: 10 }}>
        <h4 style={{ marginBottom: 4 }}>{t("twoFactor")}</h4>
        <p className="tiny" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          {t("twoFactorHint")}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm" disabled title={t("comingSoon")}>
            {t("enable2fa")}
          </button>
          <span
            className="chip"
            style={{
              background: "color-mix(in oklab, oklch(70% 0.15 60) 16%, transparent)",
              color: "oklch(50% 0.15 60)",
              borderColor: "transparent",
            }}
          >
            {t("notEnabled")}
          </span>
        </div>
      </Glass>

      <Glass faint style={{ padding: 14, borderRadius: 10 }}>
        <h4 style={{ marginBottom: 4 }}>{t("sessions")}</h4>
        <p className="tiny" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          {t("sessionsHint")}
        </p>
        <div className="row" style={{ gap: 10 }}>
          <Icons.Globe size={14} style={{ color: "var(--ink-2)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t("thisBrowser")}</div>
            <div className="tiny">{t("activeNow")}</div>
          </div>
          <span className="chip">{t("thisDevice")}</span>
        </div>
        <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
          {t("sessionsNote")}
        </p>
      </Glass>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function UPField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="row" style={{ marginBottom: 5, gap: 8 }}>
        <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)" }}>{label}</label>
        {hint && <span className="tiny" style={{ marginLeft: "auto" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function UPToggle({
  title,
  sub,
  on,
  onChange,
}: {
  title: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="row" style={{ padding: "10px 0", borderBottom: "0.5px solid var(--line)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{title}</div>
        {sub && <div className="tiny" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      <button
        type="button"
        className={`switch ${on ? "on" : ""}`}
        onClick={() => onChange(!on)}
        aria-pressed={on}
        aria-label={title}
      />
    </div>
  );
}

const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Athens",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
