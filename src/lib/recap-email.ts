// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/recap-email.ts — render a RecapResult into an email body.
//
// Used by the recap worker when sending the daily / weekly / monthly
// digest. Plain HTML, no external assets — works in every mail client
// without surprises and keeps deliverability clean.

import type { RecapItem, RecapResult, RecapScope } from "@/lib/recap";

export type RenderedRecap = {
  subject: string;
  html: string;
  text: string;
};

const SEVERITY_COLOR: Record<RecapItem["severity"], string> = {
  celebrate: "#16a34a",
  warn: "#d97706",
  good: "#5b8def",
  info: "#475569",
};

const SCOPE_LABEL: Record<RecapScope, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
};

/**
 * Render a recap into a self-contained HTML email. Inline styles only —
 * Gmail strips <style>, Outlook is allergic to most CSS. We aim for the
 * lowest common denominator that still feels Vellum-branded.
 */
export function renderRecapEmail(args: {
  workspaceName: string;
  recap: RecapResult;
  baseUrl?: string;
  recipientEmail: string;
  unsubscribeUrl?: string;
}): RenderedRecap {
  const { workspaceName, recap, baseUrl, recipientEmail } = args;
  const dateLabel = formatDateLabel(recap);
  const subject =
    recap.scope === "today"
      ? `${workspaceName} · today's recap (${dateLabel})`
      : recap.scope === "week"
      ? `${workspaceName} · weekly recap (${dateLabel})`
      : `${workspaceName} · monthly recap (${dateLabel})`;

  const itemsHtml = recap.items.length
    ? recap.items
        .map((item) => renderItemHtml(item, baseUrl))
        .join("\n")
    : `<p style="font-size:14px;color:#475569;margin:8px 0;">Nothing notable in this window — the recap fills in as activity picks up.</p>`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${escape(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f6f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f6f9;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:14px;border:0.5px solid rgba(0,0,0,0.06);overflow:hidden;">
          <tr><td style="padding:24px 28px 8px;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:600;">
              Vellum · ${escape(workspaceName)}
            </div>
            <h1 style="font-size:22px;margin:6px 0 0;font-weight:600;letter-spacing:-0.01em;">
              ${SCOPE_LABEL[recap.scope]}'s recap
            </h1>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">${escape(dateLabel)}${
    recap.hasAI ? ' · <span style="color:#5b8def;">includes AI insights</span>' : ""
  }</div>
          </td></tr>
          <tr><td style="padding:12px 28px 8px;">
            ${itemsHtml}
          </td></tr>
          <tr><td style="padding:16px 28px 24px;">
            <a href="${escape(baseUrl || "")}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#5b8def,#7c5bef);color:#ffffff;text-decoration:none;font-size:13px;font-weight:500;padding:10px 18px;border-radius:8px;">
              Open Vellum →
            </a>
          </td></tr>
          <tr><td style="padding:16px 28px;background:#fafafc;border-top:0.5px solid rgba(0,0,0,0.06);font-size:11px;color:#94a3b8;line-height:1.6;">
            Sent to ${escape(recipientEmail)} because you receive ${SCOPE_LABEL[recap.scope].toLowerCase()} recaps for ${escape(workspaceName)}.<br />
            ${
              args.unsubscribeUrl
                ? `<a href="${escape(args.unsubscribeUrl)}" style="color:#94a3b8;">Unsubscribe</a> · `
                : ""
            }<a href="${escape(baseUrl || "")}/settings" style="color:#94a3b8;">Manage in Settings</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = buildTextVersion({ workspaceName, recap, dateLabel, baseUrl });
  return { subject, html, text };
}

function renderItemHtml(item: RecapItem, baseUrl: string | undefined): string {
  const color = SEVERITY_COLOR[item.severity];
  const link = item.href && baseUrl ? `${baseUrl}${item.href}` : item.href || "";
  const tint = item.source === "ai" ? "background:rgba(91,141,239,0.06);border-left:2px solid #5b8def;" : "";
  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
      <tr>
        <td valign="top" style="padding:8px 10px 8px 12px;border-radius:8px;${tint}">
          <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};margin:6px 8px 0 0;vertical-align:top;"></span>
          <span style="font-size:13.5px;color:#1e293b;line-height:1.5;">${renderText(item.text)}</span>
          ${item.source === "ai" ? `<span style="display:inline-block;margin-left:8px;font-size:10px;color:#5b8def;font-weight:600;letter-spacing:0.04em;">AI</span>` : ""}
        </td>
      </tr>
    </table>`;
  return link
    ? `<a href="${escape(link)}" style="text-decoration:none;color:inherit;display:block;">${content}</a>`
    : content;
}

function buildTextVersion(args: {
  workspaceName: string;
  recap: RecapResult;
  dateLabel: string;
  baseUrl?: string;
}): string {
  const { workspaceName, recap, dateLabel } = args;
  const lines: string[] = [];
  lines.push(`Vellum · ${workspaceName}`);
  lines.push(`${SCOPE_LABEL[recap.scope]}'s recap (${dateLabel})`);
  if (recap.hasAI) lines.push(`Includes AI insights.`);
  lines.push("");
  if (recap.items.length === 0) {
    lines.push("Nothing notable in this window.");
  } else {
    for (const item of recap.items) {
      const bullet = item.severity === "celebrate" ? "🎉" : item.severity === "warn" ? "⚠︎" : "•";
      lines.push(`${bullet} ${stripMarkdown(item.text)}${item.source === "ai" ? "  [AI]" : ""}`);
    }
  }
  lines.push("");
  lines.push(`Open Vellum: ${args.baseUrl || ""}/dashboard`);
  return lines.join("\n");
}

function formatDateLabel(recap: RecapResult): string {
  if (recap.scope === "today") {
    return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }
  if (recap.scope === "week") {
    return `Week ${recap.bucket.split("-W")[1] || ""}`;
  }
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function renderText(text: string): string {
  return escape(text).replace(/\*\*([^*]+)\*\*/g, '<b style="font-weight:600;color:#0f172a;">$1</b>');
}

function stripMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}
