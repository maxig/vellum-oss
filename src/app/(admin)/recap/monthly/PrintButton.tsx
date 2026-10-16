// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/primitives";

export default function PrintButton() {
  const t = useTranslations("dashboard.monthly");
  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
      <Icons.ArrowUpRight size={12} stroke={2}/> {t("savePdf")}
    </button>
  );
}
