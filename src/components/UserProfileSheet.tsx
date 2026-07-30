// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { signOut } from "next-auth/react";
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
      flash("Could not save.");
      return;
    }
    flash("Saved.");
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
        aria-label="Your profile"
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
            aria-label="Close"
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
                <Chip accent>{initial.role}</Chip>
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>
                {form.title || "—"} · joined {initial.joinedAt}
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
              { id: "profile", l: "Profile" },
              { id: "stats", l: "My stats" },
              { id: "prefs", l: "Notifications" },
              { id: "account", l: "Account" },
            ] as { id: Tab; l: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 500,
                background: "transparent",
                border: 0,
                font: "inherit",
                color: tab === t.id ? "var(--ink-0)" : "var(--ink-2)",
                borderBottom: tab === t.id ? "1.5px solid var(--accent-solid)" : "1.5px solid transparent",
                marginBottom: "-0.5px",
                cursor: "default",
              }}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div
          className="scroll"
          style={{ padding: "22px 24px", overflowY: "auto", minHeight: 0, flex: 1 }}
        >
          {tab === "profile" && (
            <div className="col" style={{ gap: 14 }}>
              <UPField label="Full name">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </UPField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <UPField label="Job title">
                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="Talent Partner"
                  />
                </UPField>
                <UPField label="Pronouns">
                  <input
                    className="input"
                    value={form.pronouns}
                    onChange={(e) => set("pronouns", e.target.value)}
                    placeholder="she/her"
                  />
                </UPField>
              </div>
              <UPField label="Email" hint="Changing email requires re-verification">
                <input
                  className="input"
                  value={form.email}
                  disabled
                  style={{ opacity: 0.7, cursor: "not-allowed" }}
                />
              </UPField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <UPField label="Location">
                  <input
                    className="input"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="Berlin, DE"
                  />
                </UPField>
                <UPField label="Time zone">
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
              <UPField label="Working hours" hint="Shown to teammates booking with you">
                <input
                  className="input"
                  value={form.workingHours}
                  onChange={(e) => set("workingHours", e.target.value)}
                  placeholder="Mon–Fri 9:00–17:00 CET"
                />
              </UPField>
              <UPField label="Bio">
                <textarea
                  className="input autogrow"
                  data-max-lines="6"
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                  style={{ fontFamily: "inherit" }}
                />
              </UPField>
              <UPField label="Default email signature" hint="Overrides the workspace default">
                <textarea
                  className="input autogrow"
                  data-max-lines="6"
                  value={form.signature}
                  onChange={(e) => set("signature", e.target.value)}
                  style={{ fontFamily: "inherit" }}
                  placeholder={`Warmly,\n${form.name || "Your name"}`}
                />
              </UPField>
            </div>
          )}

          {tab === "stats" && <UserStats />}

          {tab === "prefs" && (
            <div className="col" style={{ gap: 0 }}>
              <h4 style={{ marginBottom: 8 }}>Email me when…</h4>
              <UPToggle
                title="A new application is submitted"
                on={notif.emailNewApplication}
                onChange={(v) => setNotifKey("emailNewApplication", v)}
              />
              <UPToggle
                title="A candidate replies to me"
                on={notif.emailCandidateReply}
                onChange={(v) => setNotifKey("emailCandidateReply", v)}
              />
              <UPToggle
                title="I'm @mentioned in a comment"
                on={notif.emailMention}
                onChange={(v) => setNotifKey("emailMention", v)}
              />
              <UPToggle
                title="An interview is 30 min away"
                on={notif.emailInterviewReminder}
                onChange={(v) => setNotifKey("emailInterviewReminder", v)}
              />
              <UPToggle
                title="A teammate moves a candidate I'm following"
                on={notif.emailFollowedCandidate}
                onChange={(v) => setNotifKey("emailFollowedCandidate", v)}
              />
              <UPToggle
                title="Weekly hiring digest"
                sub="Every Monday morning · 7am your time"
                on={notif.emailWeeklyDigest}
                onChange={(v) => setNotifKey("emailWeeklyDigest", v)}
              />

              <h4 style={{ marginTop: 22, marginBottom: 8 }}>In-app</h4>
              <UPToggle
                title="Someone assigns you a to-do"
                sub="Shows in your notifications panel"
                on={notif.notifyTodoAssigned}
                onChange={(v) => setNotifKey("notifyTodoAssigned", v)}
              />
              <UPToggle
                title="Desktop push notifications"
                on={notif.pushDesktop}
                onChange={(v) => setNotifKey("pushDesktop", v)}
              />
              <UPToggle
                title="Notification sounds"
                on={notif.soundsOn}
                onChange={(v) => setNotifKey("soundsOn", v)}
              />
              <UPToggle
                title="Do not disturb during focus hours"
                sub="11:00 – 13:00 your time on weekdays"
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
            <Icons.Logout size={12} /> Sign out
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={save}
            disabled={saving || tab === "stats" || tab === "account"}
            title={tab === "stats" || tab === "account" ? "No editable fields on this tab" : undefined}
          >
            <Icons.Check size={12} stroke={2.4} /> {saving ? "Saving…" : "Save changes"}
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
  const [data, setData] = React.useState<StatsPayload | null>(null);
  const [err, setErr] = React.useState(false);
  React.useEffect(() => {
    fetch("/api/profile/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  if (err) return <p className="muted">Could not load stats.</p>;
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
        <UserStat n={String(last30.candidatesTouched)} l="Candidates touched" sub="last 30 days" />
        <UserStat n={String(last30.interviewsScheduled)} l="Interviews scheduled" sub="last 30 days" />
        <UserStat
          n={replyValue}
          l="Reply within 48h"
          sub={last30.replyDenominator > 0 ? `${last30.replyDenominator} inbound · 30 days` : "no inbound yet"}
        />
      </div>
      <Glass faint style={{ padding: 16, borderRadius: 12 }}>
        <h4 style={{ marginBottom: 12 }}>This week</h4>
        <div className="col" style={{ gap: 10 }}>
          <UpcomingItem
            icon="Calendar"
            t={`${thisWeek.interviewsScheduled} interview${thisWeek.interviewsScheduled === 1 ? "" : "s"} scheduled`}
            sub={thisWeek.interviewsScheduled ? "this week" : "none yet"}
          />
          <UpcomingItem
            icon="Mail"
            t={`${thisWeek.repliesSent} repl${thisWeek.repliesSent === 1 ? "y" : "ies"} sent`}
            sub={
              thisWeek.medianReplyHours != null
                ? `median response: ${thisWeek.medianReplyHours}h`
                : "no replies yet"
            }
          />
          <UpcomingItem
            icon="Pipeline"
            t={`${thisWeek.stageMoves} stage move${thisWeek.stageMoves === 1 ? "" : "s"}`}
            sub={`${thisWeek.stageMovesForward} forward · ${thisWeek.stageMovesArchive} archive`}
          />
          {thisWeek.offerAccepted && (
            <UpcomingItem
              icon="Heart"
              t="1 offer accepted"
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
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function changePassword() {
    if (next.length < 6) {
      onFlash("Password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      onFlash("New passwords don't match.");
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
      onFlash("Could not change password.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setOpen(false);
    onFlash("Password updated.");
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <Glass faint style={{ padding: 14, borderRadius: 10 }}>
        <h4 style={{ marginBottom: 4 }}>Password</h4>
        <p className="tiny" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          Set a new password to sign in with email + password.
        </p>
        {!open ? (
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Change password
          </button>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            <input
              className="input"
              type="password"
              placeholder="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <input
              className="input"
              type="password"
              placeholder="New password (min 6 chars)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="input"
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy || !next || next !== confirm}
                onClick={changePassword}
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </div>
          </div>
        )}
      </Glass>

      <Glass faint style={{ padding: 14, borderRadius: 10 }}>
        <h4 style={{ marginBottom: 4 }}>Two-factor authentication</h4>
        <p className="tiny" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          Protect your account with a second factor. Strongly recommended for admins.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm" disabled title="Coming soon">
            Enable 2FA
          </button>
          <span
            className="chip"
            style={{
              background: "color-mix(in oklab, oklch(70% 0.15 60) 16%, transparent)",
              color: "oklch(50% 0.15 60)",
              borderColor: "transparent",
            }}
          >
            Not enabled
          </span>
        </div>
      </Glass>

      <Glass faint style={{ padding: 14, borderRadius: 10 }}>
        <h4 style={{ marginBottom: 4 }}>Active sessions</h4>
        <p className="tiny" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          Devices currently signed in with your credentials.
        </p>
        <div className="row" style={{ gap: 10 }}>
          <Icons.Globe size={14} style={{ color: "var(--ink-2)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>This browser</div>
            <div className="tiny">Active now</div>
          </div>
          <span className="chip">This device</span>
        </div>
        <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
          A full session list is coming with the device-management release. Use Sign out to end
          this session.
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
