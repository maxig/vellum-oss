// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="ambient"><div className="blob" /></div>
      <main className="auth-shell">{children}</main>
    </>
  );
}
