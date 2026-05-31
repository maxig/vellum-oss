// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Glass, Chip, Avatar, Icons } from "@/components/primitives";
import { relativeTime } from "@/lib/utils";
import { emailToText, stripHtml } from "@/lib/sanitize";
import ProfileSheet from "@/components/ProfileSheet";
import Wysiwyg from "@/components/Wysiwyg";

type ThreadItem = {
  id: string;
  subject: string;
  candidate: { id: string; name: string };
  jobTitle: string | null;
  starred: boolean;
  unread: boolean;
  lastAt: string;
  preview: string;
  lastDirection: "in" | "out" | "system";
};
type ActiveThread = {
  id: string;
  subject: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  stage: { name: string; color: string } | null;
  starred: boolean;
  applicationId: string | null;
  messages: { id: string; direction: "in" | "out" | "system"; body: string; from: string | null; createdAt: string }[];
};

export default function InboxView({
  currentUser,
  threads,
  activeId,
  active,
  filter,
  emailEnabled,
  fromAddress,
  stages,
}: {
  currentUser: { id: string; name: string; signature: string };
  threads: ThreadItem[];
  activeId: string | null;
  active: ActiveThread | null;
  filter: string;
  emailEnabled?: boolean;
  fromAddress?: string | null;
  stages?: { id: string; key: string; name: string; color: string }[];
}) {
  const router = useRouter();
  const [reply, setReply] = React.useState(currentUser.signature ? `\n\n${currentUser.signature}` : "");
  const [sending, setSending] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [openProfile, setOpenProfile] = React.useState<string | null>(null);
  const messagesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (active?.id && !reply && currentUser.signature) {
      setReply(`\n\n${currentUser.signature}`);
    }
  }, [active?.id, currentUser.signature, reply]);

  React.useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [active?.id, active?.messages.length]);

  const filteredThreads = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const hay = [t.candidate.name, t.subject, t.preview, t.jobTitle || ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [search, threads]);

  async function send() {
    if (!stripHtml(reply).trim() || !active) return;
    setSending(true);
    setSendError(null);

    let response: Response | null = null;
    if (emailEnabled) {
      response = await fetch(`/api/threads/${active.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      }).catch(() => null);
    }
    if (!response || !response.ok) {
      // Try to pull a useful error message before deciding whether to fall back.
      let smtpError: string | null = null;
      if (response && response.status !== 412) {
        const json = await response.json().catch(() => ({}));
        smtpError = json?.error || `SMTP returned ${response.status}`;
      }
      const internal = await fetch(`/api/threads/${active.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply, direction: "out" }),
      });
      if (!internal.ok) {
        const j = await internal.json().catch(() => ({}));
        setSendError(j?.error || smtpError || "Could not send.");
        setSending(false);
        return;
      }
      // Internal save succeeded but SMTP didn't — surface the original error so
      // the recruiter knows the candidate didn't actually receive a real email.
      if (smtpError) setSendError(`Saved as internal message. ${smtpError}`);
    }

    setReply("");
    setSending(false);
    router.refresh();
  }

  async function toggleStar() {
    if (!active) return;
    await fetch(`/api/threads/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ starred: !active.starred }),
    });
    router.refresh();
  }

  function aiDraft() {
    if (!active) return;
    setComposing(true);
    setReply("");
    fetch(`/api/ai/draft-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: active.id }),
    })
      .then((r) => r.json())
      .then((j) => {
        let text: string = j.text || "Thanks for getting back to me. Let me know what timing works best on your end.";
        if (currentUser.signature) {
          text += `\n\n${currentUser.signature}`;
        }
        // Type-on effect to match the design's shimmer.
        let i = 0;
        const tick = () => {
          i += Math.max(1, Math.round(Math.random() * 4));
          setReply(text.slice(0, i));
          if (i < text.length) setTimeout(tick, 18);
          else setComposing(false);
        };
        setTimeout(tick, 200);
      })
      .catch(() => setComposing(false));
  }

  const filters: { id: string; l: string }[] = [
    { id: "all", l: "All" },
    { id: "unread", l: "Unread" },
    { id: "starred", l: "Starred" },
  ];

  return (
    <>
      <div className="inbox-layout">
        {/* Sidebar */}
        <div className="inbox-list">
          <div className="inbox-list-head">
            <Glass faint className="inbox-search">
              <Icons.Search size={14} style={{ color: "var(--ink-2)" }} />
              <input
                placeholder="Search messages…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ background: "transparent", border: 0, outline: 0, color: "var(--ink-0)", fontSize: 13, width: "100%" }}
              />
            </Glass>
            <div className="row" style={{ marginTop: 10, gap: 2 }}>
              {filters.map((f) => (
                <Link
                  key={f.id}
                  href={`/inbox?filter=${f.id}`}
                  className="btn btn-sm btn-ghost"
                  style={{
                    height: 26,
                    padding: "0 10px",
                    fontSize: 12,
                    borderRadius: 7,
                    background: filter === f.id ? "var(--glass-bg-strong)" : "transparent",
                    border: filter === f.id ? "0.5px solid var(--glass-border)" : "0.5px solid transparent",
                    color: filter === f.id ? "var(--ink-0)" : "var(--ink-2)",
                  }}
                >
                  {f.l}
                </Link>
              ))}
            </div>
          </div>

          <div className="scroll" style={{ flex: 1, overflowY: "auto" }}>
            {filteredThreads.length === 0 && (
              <div className="muted" style={{ padding: 28, textAlign: "center" }}>
                {search ? "No matching conversations." : "No conversations."}
              </div>
            )}
            {filteredThreads.map((t) => {
              const isActive = t.id === activeId;
              const previewText = emailToText(t.preview).split("\n")[0];
              return (
                <Link
                  key={t.id}
                  href={`/inbox?thread=${t.id}${filter !== "all" ? `&filter=${filter}` : ""}`}
                  className="inbox-thread"
                  data-active={isActive ? "true" : "false"}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="row" style={{ gap: 10, marginBottom: 5 }}>
                    <Avatar name={t.candidate.name} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: t.unread ? 600 : 500,
                            color: "var(--ink-0)",
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.candidate.name}
                        </span>
                        <span className="tiny" style={{ flexShrink: 0 }}>{relativeTime(t.lastAt)}</span>
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--ink-1)",
                          fontWeight: t.unread ? 500 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.subject}
                      </div>
                    </div>
                  </div>
                  <div
                    className="inbox-preview"
                    style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4 }}
                  >
                    {t.lastDirection === "out" && <span style={{ color: "var(--ink-2)" }}>You: </span>}
                    {previewText}
                  </div>
                  <div className="row" style={{ marginTop: 6, gap: 5 }}>
                    {t.unread && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--accent-solid)",
                        }}
                      />
                    )}
                    {t.starred && (
                      <Icons.Star size={11} fill="oklch(75% 0.15 80)" stroke={0} style={{ color: "oklch(75% 0.15 80)" }} />
                    )}
                    {t.jobTitle && (
                      <span className="chip" style={{ height: 17, fontSize: 10, padding: "0 6px" }}>
                        {t.jobTitle.split(" ").slice(0, 2).join(" ")}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        {!active ? (
          <div className="muted" style={{ padding: 40, textAlign: "center", margin: "auto" }}>
            Select a conversation
          </div>
        ) : (
          <div className="inbox-thread-pane">
            {/* Header */}
            <div className="inbox-thread-head">
              <Avatar name={active.candidateName} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{active.candidateName}</span>
                  {active.stage && <Chip dot={active.stage.color}>{active.stage.name}</Chip>}
                </div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {active.subject}
                  {active.jobTitle ? ` · ${active.jobTitle}` : ""}
                </div>
              </div>
              <button className="iconbtn" onClick={toggleStar} title={active.starred ? "Unstar" : "Star"}>
                <Icons.Star
                  size={15}
                  fill={active.starred ? "oklch(75% 0.15 80)" : "none"}
                  stroke={active.starred ? 0 : 1.6}
                  style={{ color: active.starred ? "oklch(75% 0.15 80)" : "var(--ink-2)" }}
                />
              </button>
              {active.applicationId && (
                <button className="btn btn-sm" onClick={() => setOpenProfile(active.applicationId)}>
                  <Icons.ArrowUpRight size={11} /> Open profile
                </button>
              )}
              <div className="iconbtn"><Icons.MoreH size={15} /></div>
            </div>

            {/* Messages */}
            <div ref={messagesRef} className="scroll inbox-thread-messages">
              <div className="inbox-message-stack">
                {active.messages.map((m) => (
                  <MessageBubble key={m.id} m={m} candidateName={active.candidateName} />
                ))}
                {active.messages[active.messages.length - 1]?.direction === "in" && (
                  <div className="row" style={{ gap: 8, color: "var(--ink-2)", marginTop: 4, alignSelf: "flex-start" }}>
                    <span className="tiny">awaiting your reply</span>
                  </div>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="inbox-composer-wrap">
              <div className="inbox-composer-inner">
                <Glass faint style={{ borderRadius: 12, padding: 12, position: "relative" }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <span className="tiny">Reply to {active.candidateName.split(" ")[0]}</span>
                    <span style={{ flex: 1 }} />
                    <button
                      className="btn btn-sm btn-ghost"
                      type="button"
                      onClick={aiDraft}
                      disabled={composing}
                    >
                      <Icons.Sparkle size={12} stroke={2} /> {composing ? "Drafting…" : "AI draft"}
                    </button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <Wysiwyg
                      value={reply}
                      onChange={setReply}
                      placeholder="Type your reply… (⌘↵ to send)"
                      minHeight={120}
                      maxLines={15}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />
                    {composing && (
                      <div
                        className="ai-shimmer"
                        style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 10 }}
                      />
                    )}
                  </div>
                  {sendError && (
                    <div className="chip chip-danger" style={{ marginTop: 8 }}>{sendError}</div>
                  )}
                  <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className="iconbtn" style={{ width: 28, height: 28 }} aria-label="Attach">
                      <Icons.Paperclip size={13} />
                    </button>
                    <button type="button" className="iconbtn" style={{ width: 28, height: 28 }} aria-label="Template">
                      <Icons.FileText size={13} />
                    </button>
                    <button type="button" className="iconbtn" style={{ width: 28, height: 28 }} aria-label="Schedule">
                      <Icons.Calendar size={13} />
                    </button>
                    {emailEnabled ? (
                      <Chip dot="oklch(68% 0.16 150)">via {fromAddress || "SMTP"}</Chip>
                    ) : (
                      <Chip>
                        Internal only — <Link href="/settings?tab=email" style={{ color: "var(--accent-solid)" }}>connect email</Link>
                      </Chip>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={send}
                      disabled={sending || !stripHtml(reply).trim() || composing}
                    >
                      <Icons.Send size={11} stroke={2} /> {sending ? "Sending…" : "Send reply"}
                    </button>
                  </div>
                </Glass>
              </div>
            </div>
          </div>
        )}
      </div>

      {openProfile && stages && (
        <ProfileSheet
          applicationId={openProfile}
          stages={stages}
          currentUser={currentUser}
          onClose={() => setOpenProfile(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

function MessageBubble({ m, candidateName }: { m: ActiveThread["messages"][number]; candidateName: string }) {
  if (m.direction === "system") {
    return (
      <div className="inbox-system">
        <Glass faint className="inbox-system-card">
          <Icons.Bell size={12} style={{ marginRight: 8, flexShrink: 0, marginTop: 2 }} />
          <span>{emailToText(m.body)}</span>
        </Glass>
      </div>
    );
  }
  const isOut = m.direction === "out";
  const display = emailToText(m.body);
  return (
    <div className={`inbox-message ${isOut ? "inbox-message-out" : "inbox-message-in"}`}>
      <Avatar name={m.from || (isOut ? "Team" : candidateName)} size="md" />
      <div className="inbox-message-body">
        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-0)" }}>
            {m.from || (isOut ? "Team" : candidateName)}
          </span>
          <span className="tiny">{relativeTime(m.createdAt)}</span>
        </div>
        <div className={`inbox-bubble ${isOut ? "inbox-bubble-out" : "inbox-bubble-in"}`}>{display}</div>
      </div>
    </div>
  );
}
