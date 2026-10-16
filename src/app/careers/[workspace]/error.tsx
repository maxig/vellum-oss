// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { logger } from "@/lib/log";

const log = logger("careers");

export default function CareersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("careers.errors");
  React.useEffect(() => {
    log.error("render error:", error);
  }, [error]);

  return (
    <div style={{ maxWidth: 440, margin: "16vh auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, marginBottom: 10 }}>{t("title")}</h1>
      <p className="muted" style={{ marginBottom: 22, lineHeight: 1.5 }}>
        {t("body")}
      </p>
      <button className="btn btn-primary" onClick={reset}>
        {t("tryAgain")}
      </button>
    </div>
  );
}
