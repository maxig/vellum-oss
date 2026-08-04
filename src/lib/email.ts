// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Per-workspace email integration (IMAP inbound + SMTP outbound).
 *
 * The plumbing here is intentionally simple — it's an OSS MVP, not Front:
 *
 * - Outbound: nodemailer SMTP, sent with the workspace's `fromAddress`.
 * - Inbound: imapflow polls INBOX since the last seen UID, parses each
 *   message, looks up the candidate by sender address, and appends a Message
 *   to the matching workspace thread (creating one when needed). Messages
 *   from unknown senders are skipped silently.
 *
 * No persistent connection is held — every poll connects, fetches, closes.
 * That's fine for a single-org self-hosted deploy and avoids leaking sockets
 * across Next.js HMR reloads.
 */
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
// This file builds its own runtime prefix (`[email-poll/<workspaceId>]`), so it
// uses the unprefixed logger rather than a namespaced one.
import { log } from "@/lib/log";

type EmailAccount = {
  workspaceId: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPasswordEncrypted: string;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPasswordEncrypted: string;
  smtpTls: boolean;
  fromAddress: string;
  fromName: string | null;
  enabled: boolean;
  lastUid: number;
  lastPolledAt: Date | null;
};

// How far back from the previous poll we re-examine the mailbox. A 1-hour
// overlap protects against:
//   - IMAP servers re-numbering UIDs (rare but possible with rebuilt indexes)
//   - Messages that arrived in the same poll window but were INTERNALDATE-
//     stamped just before the previous run finished
//   - A poll that crashed mid-fetch before persisting `lastPolledAt`
// Dedupe by externalMessageId keeps this safe to re-scan.
const POLL_GRACE_MS = 60 * 60 * 1000;

function smtpTransport(acct: EmailAccount) {
  return nodemailer.createTransport({
    host: acct.smtpHost,
    port: acct.smtpPort,
    secure: acct.smtpPort === 465 || (acct.smtpTls && acct.smtpPort !== 587),
    requireTLS: acct.smtpTls && acct.smtpPort === 587,
    auth: {
      user: acct.smtpUser,
      pass: decryptSecret(acct.smtpPasswordEncrypted),
    },
    // Tighter timeouts so a misconfigured host doesn't hang the API route.
    connectionTimeout: 12_000,
    socketTimeout: 20_000,
  });
}

function imapClient(acct: EmailAccount) {
  return new ImapFlow({
    host: acct.imapHost,
    port: acct.imapPort,
    secure: acct.imapTls,
    auth: {
      user: acct.imapUser,
      pass: decryptSecret(acct.imapPasswordEncrypted),
    },
    logger: false,
  });
}

export async function testEmailConnection(acct: EmailAccount): Promise<{ imap: boolean; smtp: boolean; error?: string }> {
  let imapOk = false;
  let smtpOk = false;
  let error: string | undefined;

  try {
    const client = imapClient(acct);
    await client.connect();
    await client.logout();
    imapOk = true;
  } catch (e) {
    error = (e as Error).message;
  }

  try {
    const transport = smtpTransport(acct);
    await transport.verify();
    smtpOk = true;
  } catch (e) {
    if (!error) error = (e as Error).message;
  }

  return { imap: imapOk, smtp: smtpOk, error };
}

export type OutboundAttachment = {
  filename: string;
  content: string | Buffer;
  contentType: string;
  /**
   * Some calendar clients (Gmail, Outlook) parse calendar invites better
   * when the attachment is `inline`, others (Apple Mail) prefer a real
   * attachment. We default to inline for text/calendar and an attachment
   * for everything else.
   */
  disposition?: "inline" | "attachment";
  /**
   * For text/calendar bodies, the METHOD param goes on the Content-Type
   * header so MUAs treat the file as an iTIP request rather than a noop.
   */
  method?: "REQUEST" | "CANCEL" | "PUBLISH";
};

export async function sendOutboundEmail(
  workspaceId: string,
  opts: {
    to: string;
    cc?: string[];
    subject: string;
    text: string;
    html?: string;
    inReplyTo?: string;
    references?: string[];
    attachments?: OutboundAttachment[];
    /** Optional iTIP `alternatives` body so calendar invites round-trip cleanly. */
    icalEvent?: { method: "REQUEST" | "CANCEL" | "PUBLISH"; content: string };
  },
): Promise<{ messageId: string }> {
  const acct = (await db.emailAccount.findUnique({ where: { workspaceId } })) as EmailAccount | null;
  if (!acct || !acct.enabled) throw new Error("Email is not configured for this workspace.");

  const transport = smtpTransport(acct);
  const from = acct.fromName ? `"${acct.fromName.replace(/"/g, "")}" <${acct.fromAddress}>` : acct.fromAddress;
  const result = await transport.sendMail({
    from,
    to: opts.to,
    cc: opts.cc && opts.cc.length ? opts.cc : undefined,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    inReplyTo: opts.inReplyTo,
    references: opts.references && opts.references.length ? opts.references : undefined,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType:
        a.contentType === "text/calendar" && a.method
          ? `text/calendar; charset=utf-8; method=${a.method}`
          : a.contentType,
      contentDisposition: a.disposition || (a.contentType === "text/calendar" ? "inline" : "attachment"),
    })),
    icalEvent: opts.icalEvent,
  });
  return { messageId: result.messageId || "" };
}

/**
 * Pull recent INBOX messages by date (rather than by UID) and ingest the ones
 * matching a known candidate's email address or job title.
 *
 * Scoping by `SINCE(lastPolledAt - 1h)` instead of `UID > lastUid` is more
 * forgiving: a UID-only fetch silently drops any message whose UID landed
 * below our recorded high-water mark (which happens after server rebuilds or
 * when we missed a previous poll), whereas the time window naturally catches
 * everything that arrived recently. Dedupe by externalMessageId keeps us
 * idempotent across the overlap.
 *
 * Returns the count of newly ingested messages so the caller can show a toast.
 */
export async function pollWorkspaceInbox(workspaceId: string): Promise<{ ingested: number; lastUid: number; checked: number; since: string }> {
  const startedAt = Date.now();
  // Short, scoped log prefix so the user can grep for one workspace's worth
  // of poll output without picking up unrelated noise from other tenants.
  const tag = `[email-poll/${workspaceId}]`;

  const acctRow = (await db.emailAccount.findUnique({ where: { workspaceId } })) as EmailAccount | null;
  if (!acctRow || !acctRow.enabled) {
    log.debug(`${tag} skipped — no account or disabled`);
    return { ingested: 0, lastUid: 0, checked: 0, since: new Date(0).toISOString() };
  }

  const client = imapClient(acctRow);
  const ingested = 0;
  const highestUid = acctRow.lastUid;
  const checked = 0;

  // Resolve the lower bound for this scan.
  //   - last polled  → lastPolledAt - 1h grace window
  //   - never polled → look back 24h to seed the workspace's inbox
  const now = Date.now();
  const since = acctRow.lastPolledAt
    ? new Date(Math.max(0, acctRow.lastPolledAt.getTime() - POLL_GRACE_MS))
    : new Date(now - 24 * 60 * 60 * 1000);
  // IMAP `SINCE` is day-granular, but imapflow translates a JS Date by trimming
  // to midnight in UTC. We over-fetch slightly and filter in JS.
  const sinceTs = since.getTime();

  log.debug(
    `${tag} starting · host=${acctRow.imapHost} ` +
      `lastPolledAt=${acctRow.lastPolledAt?.toISOString() || "(never)"} ` +
      `since=${since.toISOString()} lastUid=${acctRow.lastUid}`,
  );
  // The mailbox login is an address — kept out of the debug line above.
  log.trace(`${tag} starting · user=${acctRow.imapUser}`);

  try {
    await client.connect();
    log.debug(`${tag} IMAP connected`);
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Ask the server for UIDs of messages since the cutoff date.
      const searchResult = await client.search({ since }).catch((e) => {
        log.warn(`${tag} IMAP search failed:`, (e as Error).message);
        return null;
      });
      if (log.enabled("trace")) log.trace(`${tag} searchResult=`, JSON.stringify(searchResult));
      const uidList = Array.isArray(searchResult) ? searchResult.slice(-200) : null;
      log.debug(
        `${tag} search returned ${uidList ? uidList.length : "0 (fallback to SINCE fetch)"} candidate UIDs`,
      );
      const fetchQuery = uidList && uidList.length > 0 ? { uid: uidList.join(",") } : { since };
      const ids: number[] = [];
      if (log.enabled("trace")) log.trace(`${tag} fetchQuery=`, JSON.stringify(fetchQuery));

      const messages = await client.fetchAll((uidList || []), {
        uid: true,
        envelope: true,
        internalDate: true,
        source: true, // This downloads the raw email source as a Buffer
      });

      for (const msg of messages) {
        if (log.enabled("trace")) {
          log.trace(`${tag} uid=${msg.uid} subject=${msg.envelope?.subject}`);
          // Convert the raw source Buffer into a readable string. Guarded:
          // this materialises the whole message, body and all.
          log.trace(`${tag} uid=${msg.uid} raw=`, msg.source?.toString("utf-8"));
        }

        await processMessage(msg, since, workspaceId, highestUid);
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  // Always stamp `lastPolledAt` on a clean run — whether or not we ingested
  // anything — so the next poll's window slides forward instead of re-scanning
  // the same 24h block forever.
  const polledAt = new Date();
  await db.emailAccount.update({
    where: { workspaceId },
    data: { lastPolledAt: polledAt, lastUid: highestUid, lastError: null },
  });
  const elapsedMs = Date.now() - startedAt;
  log.debug(
    `${tag} DONE · checked=${checked} ingested=${ingested} highestUid=${highestUid} ` +
      `elapsed=${elapsedMs}ms lastPolledAt=${polledAt.toISOString()}`,
  );

  return { ingested, lastUid: highestUid, checked, since: since.toISOString() };
}

/**
 * Process email message
 * and save it in the database,
 * attaching it to the applicant and related job application
 */
async function processMessage(msg: any, since: any, workspaceId: any, highestUid: any) {
  const uid = Number(msg.uid),
        sinceTs = since.getTime(),
        tag = `[email-poll/${workspaceId}]`;
  let checked = 0, ingested = 0;

  if (Number.isNaN(uid)) return;
  // Belt-and-braces filter: drop anything older than our grace window
  // regardless of what the IMAP server returned, since SINCE is fuzzy.
  const internal = msg.internalDate ? new Date(msg.internalDate as Date | string).getTime() : Number.NaN;
  if (Number.isFinite(internal) && internal < sinceTs) {
    log.trace(`${tag} uid=${uid} skip · internalDate ${new Date(internal).toISOString()} < cutoff`);
    return;
  }
  checked++;
  if (uid > highestUid) highestUid = uid;
  try {
    const parsed = await simpleParser(msg.source as Buffer);
    const fromAddr = (parsed.from?.value?.[0]?.address || "").toLowerCase();
    const fromName = parsed.from?.value?.[0]?.name || "";
    const messageId = parsed.messageId || `imap-${workspaceId}-${uid}`;
    const subject = parsed.subject || "(no subject)";
    const body = parsed.text || stripHtmlBody(parsed.html || "");
    const subjLabel = subject.length > 60 ? subject.slice(0, 57) + "…" : subject;
    log.trace(
      `${tag} uid=${uid} read · from="${fromName ? `${fromName} <${fromAddr}>` : fromAddr || "?"}" subject="${subjLabel}"`,
    );
    if (!fromAddr) {
      log.trace(`${tag} uid=${uid} skip · no From address`);
      return;
    }

    // Dedupe by external message-id — scoped to THIS workspace. A global lookup
    // would let the same Message-ID (mailing lists, shared threads, BCC) that
    // legitimately arrives in two tenants get silently dropped in the second.
    const already = await db.message.findFirst({
      where: { externalMessageId: messageId, thread: { workspaceId } },
    });
    if (already) {
      log.trace(`${tag} uid=${uid} skip · already ingested as message ${already.id} (msgId=${messageId})`);
      return;
    }

    // 0) Best match: RFC822 headers. A reply carries the original
    //    Message-ID in `In-Reply-To` and the full chain in `References`.
    //    When any of those match a message we sent earlier, route the
    //    reply straight into that thread. This is the standard mail
    //    threading approach and beats every heuristic — it works across
    //    "Re:", "Sv:", "Aw:" and even when the candidate edits the
    //    subject line entirely.
    const headerRefs = collectReferenceIds(parsed.inReplyTo, parsed.references);
    let thread = headerRefs.length
      ? (
          await db.message.findFirst({
            where: {
              externalMessageId: { in: headerRefs },
              thread: { workspaceId },
            },
            include: { thread: true },
          })
        )?.thread || null
      : null;
    let candidate = thread
      ? await db.candidate.findUnique({ where: { id: thread.candidateId } })
      : null;
    let matchedJob: { id: string; title: string } | null = null;
    let matchSource: "header" | "sender" | "sender+subject" | "subject" | "none" = thread ? "header" : "none";
    if (thread) {
      log.trace(
        `${tag} uid=${uid} match=HEADER · thread=${thread.id} candidate=${candidate?.name || "(missing)"} refs=[${headerRefs.join(", ")}]`,
      );
    } else if (headerRefs.length) {
      log.trace(
        `${tag} uid=${uid} header refs present but no thread matched · refs=[${headerRefs.join(", ")}]`,
      );
    }

    if (!thread) {
      // 1) Primary match: sender address → known candidate.
      candidate = await db.candidate.findFirst({
        where: { workspaceId, email: { equals: fromAddr, mode: "insensitive" } },
      });
      if (candidate) {
        matchSource = "sender";
        log.trace(`${tag} uid=${uid} match=SENDER · candidate=${candidate.name} (${candidate.id})`);
      } else {
        log.trace(`${tag} uid=${uid} no candidate with email=${fromAddr}`);
      }

      // 2) Secondary match: when the sender isn't in our candidate table
      //    (forwarded mail, an aliased address, etc), try to recover the
      //    context from the subject line. We look for an open job whose
      //    title appears in the subject, then pick the candidate that
      //    matches the sender's name within that job's applicants. This
      //    handles common patterns like "Re: Senior Product Designer —
      //    application" and avoids dropping legitimate replies on the floor.
      if (!candidate) {
        matchedJob = await findJobBySubject(workspaceId, subject);
        if (matchedJob) {
          log.trace(`${tag} uid=${uid} subject hits job="${matchedJob.title}" (${matchedJob.id})`);
          candidate = await findCandidateBySenderName(workspaceId, matchedJob.id, fromName, fromAddr);
          if (candidate) {
            matchSource = "subject";
            log.trace(
              `${tag} uid=${uid} match=SUBJECT · candidate=${candidate.name} (${candidate.id}) job="${matchedJob.title}"`,
            );
          } else {
            log.trace(
              `${tag} uid=${uid} job matched but no applicant name match · fromName="${fromName}" fromAddr=${fromAddr}`,
            );
          }
        } else {
          log.trace(`${tag} uid=${uid} no job title found in subject`);
        }
      } else {
        // Sender is known — still use the subject to pick the right
        // candidate↔job thread when the candidate has applied to
        // multiple roles. This stops replies from collapsing into the
        // most-recent thread regardless of which role they reference.
        matchedJob = await findJobBySubject(workspaceId, subject);
        if (matchedJob) {
          matchSource = "sender+subject";
          log.trace(
            `${tag} uid=${uid} also matched job="${matchedJob.title}" → will thread under candidate↔job`,
          );
        }
      }
      if (!candidate) {
        log.trace(`${tag} uid=${uid} DROP · no match (from=${fromAddr}, subject="${subjLabel}")`);
        return;
      }

      // Prefer to reuse the thread for the candidate+matched job pair when
      // we have it; otherwise fall back to the candidate's most recent
      // thread so replies stay grouped.
      thread = matchedJob
        ? await db.thread.findFirst({
            where: { workspaceId, candidateId: candidate.id, jobId: matchedJob.id },
            orderBy: { lastAt: "desc" },
          })
        : null;
      if (!thread) {
        thread = await db.thread.findFirst({
          where: { workspaceId, candidateId: candidate.id },
          orderBy: { lastAt: "desc" },
        });
      }
      if (!thread) {
        thread = await db.thread.create({
          data: {
            workspaceId,
            candidateId: candidate.id,
            jobId: matchedJob?.id,
            subject,
            lastAt: new Date(),
            unread: true,
          },
        });
        log.trace(`${tag} uid=${uid} created new thread=${thread.id} for candidate=${candidate.name}`);
      } else {
        log.trace(`${tag} uid=${uid} reusing thread=${thread.id} ("${thread.subject}")`);
      }
    }
    if (!candidate) return;

    let ingestedMsg;
    try {
      ingestedMsg = await db.message.create({
        data: {
          threadId: thread.id,
          direction: "in",
          body: (body || "").trim().slice(0, 20_000),
          fromName: parsed.from?.value?.[0]?.name || candidate.name,
          externalMessageId: messageId,
          externalUid: uid,
        },
      });
    } catch (e) {
      // Unique (threadId, externalMessageId) violation → a concurrent poll won
      // the race and already ingested this exact message. Idempotent skip, not
      // an error: the find-first dedup above handles the common case; this
      // catches the check-then-insert gap.
      if ((e as { code?: string }).code === "P2002") {
        log.trace(`${tag} uid=${uid} skip · raced, already ingested (msgId=${messageId})`);
        return;
      }
      throw e;
    }

    await db.thread.update({
      where: { id: thread.id },
      data: { lastAt: new Date(), unread: true },
    });
    log.trace(
      `${tag} uid=${uid} INGESTED · via=${matchSource} message=${ingestedMsg.id} thread=${thread.id} candidate=${candidate.name}`,
    );

    // Pulse — record an engagement signal for ingested inbound. We do this
    // out of band to keep the IMAP worker resilient: a Pulse failure must
    // never lose a message.
    try {
      const { recordSignal } = await import("@/lib/pulse");
      const bodyLen = (body || "").trim().length;
      await recordSignal({
        workspaceId,
        candidateId: candidate.id,
        kind: bodyLen > 240 ? "message_long_reply" : "message_received",
        source: "email",
        evidence: { threadId: thread.id, messageId: ingestedMsg.id },
      });
    } catch (e) {
      log.warn(`${tag} pulse signal failed:`, e);
    }

    // Sentiment — async classifier. Idempotent on messageId, gated on the
    // workspace's `pulseSentiment` toggle inside the helper. Wrapped in
    // setImmediate so the IMAP loop never waits on the LLM.
    setImmediate(async () => {
      try {
        const { classifyAndRecordSentiment } = await import("@/lib/pulse-sentiment");
        const appWithStage = await db.application.findFirst({
          where: { workspaceId, candidateId: candidate.id, archived: false },
          include: { stage: true },
          orderBy: { appliedAt: "desc" },
        });
        await classifyAndRecordSentiment({
          workspaceId,
          candidateId: candidate.id,
          messageId: ingestedMsg.id,
          body: (body || "").trim().slice(0, 4000),
          stage: appWithStage?.stage?.key || null,
          threadSubject: thread.subject,
        });
      } catch (e) {
        log.warn(`${tag} sentiment classify failed:`, (e as Error).message);
      }
    });

    await db.notification.create({
      data: {
        workspaceId,
        userId: (await firstWorkspaceUserId(workspaceId)) || "",
        kind: "reply",
        title: `Reply from ${candidate.name}`,
        body: subject,
        icon: "Inbox",
        candidateId: candidate.id,
      },
    }).catch(() => {});

    ingested++;
  } catch (perMsgError) {
    // Don't let one malformed message poison the whole batch.
    log.warn(`${tag} uid=${uid} parse error:`, (perMsgError as Error).message);
  }
}

/**
 * Send an interview invite email with a real iCalendar attachment, so the
 * candidate gets a proper RSVP-able event in Gmail / Apple Calendar / Outlook.
 *
 * Returns the SMTP message-id (stored on the outbound Message row so future
 * replies thread under the same conversation) or null if SMTP isn't
 * configured for the workspace — failure is non-fatal for the caller.
 */
export async function sendInterviewInvite(
  workspaceId: string,
  args: {
    to: string;
    candidateName: string;
    jobTitle: string;
    interviewId: string;
    kindLabel: string;
    scheduledAt: Date;
    durationMin: number;
    interviewers: { name: string; email?: string }[];
    agenda?: string | null;
    location?: string | null;
    meetingUrl?: string | null;
    inReplyTo?: string;
    references?: string[];
    sequence?: number;
  },
): Promise<{ messageId: string } | null> {
  const acct = await db.emailAccount.findUnique({ where: { workspaceId } });
  if (!acct || !acct.enabled) return null;

  const { buildIcs } = await import("@/lib/calendar");
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
  const orgName = acct.fromName || ws?.name || "Hiring team";

  const firstName = args.candidateName.split(" ")[0] || args.candidateName;
  const when = args.scheduledAt.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const interviewerLabel =
    args.interviewers.length === 0
      ? "your interviewer"
      : args.interviewers.length === 1
      ? args.interviewers[0].name
      : `${args.interviewers
          .slice(0, -1)
          .map((i) => i.name)
          .join(", ")} and ${args.interviewers[args.interviewers.length - 1].name}`;

  const lines = [
    `Hi ${firstName},`,
    "",
    `Confirming our ${args.kindLabel.toLowerCase()} for the ${args.jobTitle} role on ${when} (${args.durationMin} min).`,
    `You'll meet with ${interviewerLabel}.`,
  ];
  if (args.meetingUrl) lines.push("", `Meeting link: ${args.meetingUrl}`);
  if (args.location && !args.meetingUrl) lines.push("", `Where: ${args.location}`);
  if (args.agenda && args.agenda.trim()) lines.push("", "Agenda:", args.agenda.trim());
  lines.push("", "A calendar invite is attached — just open it to add the event to your calendar.", "", `— ${orgName}`);
  const text = lines.join("\n");

  const ics = buildIcs({
    uid: `interview-${args.interviewId}@vellum`,
    start: args.scheduledAt,
    durationMinutes: args.durationMin,
    summary: `${args.jobTitle} — ${args.kindLabel}`,
    description: text,
    location: args.meetingUrl || args.location || undefined,
    url: args.meetingUrl || undefined,
    organizer: { name: orgName, email: acct.fromAddress },
    attendees: [
      { name: args.candidateName, email: args.to },
      ...args.interviewers
        .filter((i): i is { name: string; email: string } => !!i.email)
        .map((i) => ({ name: i.name, email: i.email })),
    ],
    sequence: args.sequence ?? 0,
    method: "REQUEST",
  });

  // CCs: every picked interviewer with an email address, minus
  //   - the candidate (already on `to`)
  //   - the workspace's own From address (we're already on the message)
  // and de-duped so a teammate listed twice doesn't get two copies.
  const fromAddr = acct.fromAddress.toLowerCase();
  const cc = Array.from(
    new Set(
      args.interviewers
        .map((i) => i.email?.trim().toLowerCase())
        .filter((e): e is string => !!e && e !== args.to.toLowerCase() && e !== fromAddr),
    ),
  );

  return sendOutboundEmail(workspaceId, {
    to: args.to,
    cc,
    subject: `${args.jobTitle} — interview on ${args.scheduledAt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })}`,
    text,
    inReplyTo: args.inReplyTo,
    references: args.references,
    // Use nodemailer's `icalEvent` exclusively — it produces the proper
    // `multipart/alternative; type="text/calendar"` iTIP structure that
    // Gmail and Outlook recognise as a real invite. We used to *also* pass
    // an `attachments[]` entry with the same .ics, which caused the
    // candidate's client to surface the file two or three times (once as
    // the alternative, once as the auto-attached invite, once as our
    // manual attachment).
    icalEvent: { method: "REQUEST", content: ics },
  });
}

/**
 * Look for an open job in `workspaceId` whose title appears (case-insensitive,
 * with the common "Re:" / "Fwd:" prefixes and bracketed tags stripped) inside
 * the email subject. Returns the most-recently-published match.
 */
async function findJobBySubject(workspaceId: string, subject: string) {
  const clean = normalizeSubject(subject);
  if (!clean) return null;
  // Only consider Open jobs first; fall back to anything if we miss.
  const jobs = await db.job.findMany({
    where: { workspaceId },
    select: { id: true, title: true, status: true, publishedAt: true, createdAt: true },
  });
  // Pick the longest title that's contained in the subject so "Senior Product
  // Designer" beats "Designer" when both exist.
  const matches = jobs
    .filter((j) => {
      const t = j.title.trim().toLowerCase();
      return t.length >= 4 && clean.includes(t);
    })
    .sort((a, b) => {
      if (a.status === "Open" && b.status !== "Open") return -1;
      if (b.status === "Open" && a.status !== "Open") return 1;
      const lenDiff = b.title.length - a.title.length;
      if (lenDiff !== 0) return lenDiff;
      const ad = (a.publishedAt || a.createdAt).getTime();
      const bd = (b.publishedAt || b.createdAt).getTime();
      return bd - ad;
    });
  return matches[0] ? { id: matches[0].id, title: matches[0].title } : null;
}

function normalizeSubject(s: string) {
  return s
    .replace(/^(\s*(re|fwd|fw|aw|sv|tr)\s*:\s*)+/i, "")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * For a known job, try to identify which applicant sent a message that came
 * from an unfamiliar address. We compare the sender's display name to each
 * applicant's name (forgiving of order/punctuation) and fall back to the
 * email's local-part as a last resort.
 */
async function findCandidateBySenderName(
  workspaceId: string,
  jobId: string,
  fromName: string,
  fromAddr: string,
) {
  const applications = await db.application.findMany({
    where: { workspaceId, jobId },
    include: { candidate: true },
  });
  if (applications.length === 0) return null;

  const needle = nameTokens(fromName || fromAddr.split("@")[0].replace(/[._\-]+/g, " "));
  if (needle.length === 0) return null;

  let best: { score: number; candidateId: string } | null = null;
  for (const app of applications) {
    const cand = nameTokens(app.candidate.name);
    if (cand.length === 0) continue;
    const score = cand.filter((t) => needle.includes(t)).length;
    if (score === 0) continue;
    if (!best || score > best.score) best = { score, candidateId: app.candidate.id };
  }
  if (!best) return null;
  return applications.find((a) => a.candidate.id === best!.candidateId)?.candidate || null;
}

function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Pull every reference-id out of the `In-Reply-To` and `References` headers.
 * Both can be either a single string or an array depending on the message;
 * normalise to a flat list of `<...>`-wrapped or bare ids.
 */
function collectReferenceIds(inReplyTo: unknown, references: unknown): string[] {
  const out = new Set<string>();
  const consume = (raw: unknown) => {
    if (!raw) return;
    const items = Array.isArray(raw) ? raw : [String(raw)];
    for (const item of items) {
      if (typeof item !== "string") continue;
      // A References header is whitespace-separated; In-Reply-To is usually one.
      for (const token of item.split(/\s+/)) {
        const t = token.trim();
        if (t.length > 0) out.add(t);
      }
    }
  };
  consume(inReplyTo);
  consume(references);
  return Array.from(out);
}

async function firstWorkspaceUserId(workspaceId: string): Promise<string | null> {
  const m = await db.membership.findFirst({
    where: { workspaceId, role: { in: ["owner", "admin"] } },
    orderBy: { createdAt: "asc" },
  });
  return m?.userId || null;
}

function stripHtmlBody(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
