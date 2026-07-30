// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";

// Last-resort boundary: catches errors thrown by the root layout itself, so it
// must render its own <html>/<body> and can't rely on globals.css being
// applied. Styles are inline and self-contained on purpose.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[global] fatal render error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0b0f",
          color: "#e7e7ea",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, marginBottom: 10 }}>Something went wrong</h1>
          <p style={{ color: "#a1a1aa", lineHeight: 1.5, marginBottom: 22 }}>
            The app ran into an unexpected problem. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              height: 38,
              padding: "0 18px",
              borderRadius: 10,
              border: "none",
              background: "#6366f1",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
