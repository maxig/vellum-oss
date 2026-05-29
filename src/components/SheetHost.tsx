// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import ProfileSheet, { type SheetStage } from "@/components/ProfileSheet";
import UserProfileSheet, { type UserProfileInitial } from "@/components/UserProfileSheet";
import ReviewQueueSheet from "@/components/ReviewQueueSheet";

/**
 * Global sheet host. Mounted once near the root of the admin layout so any
 * client component can pop open shared modals without each surface needing
 * its own copy of the sheet.
 *
 * Manages three sheets:
 *   - ProfileSheet      — candidate / application sheet
 *   - UserProfileSheet  — current user's account modal (Profile, Stats, etc.)
 *   - ReviewQueueSheet  — AI-curated action items, opened from the topbar
 *
 * Usage:
 *   const { openSheet, openUserProfile, openReviewQueue } = useProfileSheet();
 *   openSheet(applicationId);
 *   openUserProfile();
 *   openReviewQueue();
 */

type SheetCtx = {
  openSheet: (applicationId: string) => void;
  closeSheet: () => void;
  openUserProfile: () => void;
  closeUserProfile: () => void;
  openReviewQueue: () => void;
  closeReviewQueue: () => void;
};

const Ctx = React.createContext<SheetCtx | null>(null);

export function useProfileSheet(): SheetCtx {
  const v = React.useContext(Ctx);
  if (!v) {
    // Outside the provider — return no-ops rather than throwing so a stray
    // call (e.g. during a server-side render that bails) doesn't crash the
    // page.
    return {
      openSheet: () => {},
      closeSheet: () => {},
      openUserProfile: () => {},
      closeUserProfile: () => {},
      openReviewQueue: () => {},
      closeReviewQueue: () => {},
    };
  }
  return v;
}

export default function SheetHost({
  stages,
  currentUser,
  currentRole,
  userProfile,
  children,
}: {
  stages: SheetStage[];
  currentUser: { id: string; name: string };
  currentRole?: string;
  userProfile: UserProfileInitial;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [userOpen, setUserOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);

  const value = React.useMemo<SheetCtx>(
    () => ({
      openSheet: (applicationId: string) => setOpenId(applicationId),
      closeSheet: () => setOpenId(null),
      openUserProfile: () => setUserOpen(true),
      closeUserProfile: () => setUserOpen(false),
      openReviewQueue: () => setReviewOpen(true),
      closeReviewQueue: () => setReviewOpen(false),
    }),
    [],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {openId && (
        <ProfileSheet
          applicationId={openId}
          stages={stages}
          currentUser={currentUser}
          currentRole={currentRole}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {userOpen && (
        <UserProfileSheet
          initial={userProfile}
          onClose={() => setUserOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
      {reviewOpen && <ReviewQueueSheet onClose={() => setReviewOpen(false)} />}
    </Ctx.Provider>
  );
}
