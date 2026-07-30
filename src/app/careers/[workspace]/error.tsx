// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";

export default function CareersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[careers] render error:", error);
  }, [error]);

  return (
    <div style={{ maxWidth: 440, margin: "16vh auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, marginBottom: 10 }}>Something went wrong</h1>
      <p className="muted" style={{ marginBottom: 22, lineHeight: 1.5 }}>
        This page didn&apos;t load properly. Please try again in a moment.
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
