// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { pollWorkspaceInbox } from "@/lib/email";

// On-demand poll trigger so the user doesn't have to wait for the next tick
// after configuring an account.
export async function POST() {
  const { workspace } = await requireWorkspace();
  try {
    const result = await pollWorkspaceInbox(workspace.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
