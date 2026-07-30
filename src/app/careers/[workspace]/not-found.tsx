// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import Link from "next/link";

export default function CareersNotFound() {
  return (
    <div style={{ maxWidth: 440, margin: "16vh auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, marginBottom: 10 }}>Position not found</h1>
      <p className="muted" style={{ marginBottom: 22, lineHeight: 1.5 }}>
        This role may have been filled or is no longer open. Browse the current openings instead.
      </p>
      <Link className="btn btn-primary" href="/">
        View open roles
      </Link>
    </div>
  );
}
