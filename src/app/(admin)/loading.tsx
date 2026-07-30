// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

export default function AdminLoading() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <div className="skeleton-line" style={{ width: 200, height: 24, marginBottom: 20 }} />
      <div className="card" style={{ padding: 20 }}>
        <div className="skeleton-line" style={{ width: "60%" }} />
        <div className="skeleton-line" style={{ width: "90%" }} />
        <div className="skeleton-line" style={{ width: "75%" }} />
        <div className="skeleton-line" style={{ width: "45%" }} />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
