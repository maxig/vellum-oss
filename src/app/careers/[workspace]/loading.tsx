// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { useTranslations } from "next-intl";

export default function CareersLoading() {
  const t = useTranslations("common");
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }} aria-busy="true" aria-live="polite">
      <div className="skeleton-line" style={{ width: "50%", height: 32, marginBottom: 28 }} />
      <div className="skeleton-line" style={{ width: "90%" }} />
      <div className="skeleton-line" style={{ width: "80%" }} />
      <div className="skeleton-line" style={{ width: "85%" }} />
      <div className="skeleton-line" style={{ width: "40%", marginTop: 28 }} />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
