// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";
import { Icons } from "@/components/primitives";

export default function PrintButton() {
  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
      <Icons.ArrowUpRight size={12} stroke={2}/> Save as PDF
    </button>
  );
}
