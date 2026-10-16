// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function AdminNotFound() {
  const t = useTranslations("common.errors");
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 460, margin: "10vh auto", textAlign: "center", padding: 28 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>{t("notFoundTitle")}</h1>
        <p className="muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
          {t("notFoundBody")}
        </p>
        <Link className="btn btn-primary" href="/dashboard">
          {t("toDashboard")}
        </Link>
      </div>
    </div>
  );
}
