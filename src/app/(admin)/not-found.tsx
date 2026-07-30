// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 460, margin: "10vh auto", textAlign: "center", padding: 28 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Page not found</h1>
        <p className="muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
          We couldn&apos;t find what you were looking for. It may have been moved or deleted.
        </p>
        <Link className="btn btn-primary" href="/dashboard">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
