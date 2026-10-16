// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { logger } from "@/lib/log";

const log = logger("admin");

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errors");
  React.useEffect(() => {
    // Keep the technical detail in the console for operators; never surface a
    // raw error string in the UI.
    log.error("render error:", error);
  }, [error]);

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 460, margin: "10vh auto", textAlign: "center", padding: 28 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>{t("title")}</h1>
        <p className="muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
          {t("body")}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={reset}>
            {t("tryAgain")}
          </button>
          <Link className="btn" href="/dashboard">
            {t("toDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
