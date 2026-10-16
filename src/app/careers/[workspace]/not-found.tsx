// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function CareersNotFound() {
  const t = useTranslations("careers.errors");
  return (
    <div style={{ maxWidth: 440, margin: "16vh auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, marginBottom: 10 }}>{t("notFoundTitle")}</h1>
      <p className="muted" style={{ marginBottom: 22, lineHeight: 1.5 }}>
        {t("notFoundBody")}
      </p>
      <Link className="btn btn-primary" href="/">
        {t("viewRoles")}
      </Link>
    </div>
  );
}
