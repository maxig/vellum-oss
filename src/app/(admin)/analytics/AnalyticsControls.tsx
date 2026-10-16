// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Glass, Icons } from "@/components/primitives";

export function AnalyticsControls({ range, comparing }: { range: 7 | 30; comparing: boolean }) {
  const t = useTranslations("analytics.controls");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <>
      <Glass faint style={{ padding: 3, borderRadius: 9, display: "inline-flex", gap: 2 }}>
        {[7 as const, 30 as const].map((v) => ({ v })).map((o) => (
          <button
            key={o.v}
            className="btn btn-sm btn-ghost"
            onClick={() => set({ range: String(o.v) })}
            style={{
              background: range === o.v ? "var(--glass-bg-strong)" : "transparent",
              border: range === o.v ? "0.5px solid var(--glass-border)" : "0.5px solid transparent",
              fontWeight: 500,
            }}
          >
            {t("last", { n: o.v })}
          </button>
        ))}
      </Glass>
      <button className="btn btn-sm" onClick={() => set({ compare: comparing ? "0" : "1" })}>
        {comparing ? <Icons.Check size={11} stroke={2.4} /> : <Icons.Plus size={11} stroke={2} />}
        {t("compare")}
      </button>
      <button
        className="btn btn-sm"
        onClick={() => {
          window.location.href = `/api/analytics/export?range=${range}`;
        }}
      >
        <Icons.ArrowUpRight size={11} /> {t("export")}
      </button>
    </>
  );
}

export function RegenerateButton({ range }: { range: 7 | 30 }) {
  const t = useTranslations("analytics.controls");
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/analytics/summary?range=${range}&force=1`, { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icons.Sparkle size={11} stroke={2} /> {busy ? t("regenerating") : t("regenerate")}
    </button>
  );
}
