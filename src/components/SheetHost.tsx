// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import ProfileSheet, { type SheetStage } from "@/components/ProfileSheet";
import UserProfileSheet, { type UserProfileInitial } from "@/components/UserProfileSheet";
import ReviewQueueSheet from "@/components/ReviewQueueSheet";
import JobWizardModal from "@/app/(admin)/jobs/new/JobWizardModal";

/**
 * Global sheet host. Mounted once near the root of the admin layout so any
 * client component can pop open shared modals without each surface needing
 * its own copy of the sheet.
 *
 * Manages four sheets:
 *   - ProfileSheet      — candidate / application sheet
 *   - UserProfileSheet  — current user's account modal (Profile, Stats, etc.)
 *   - ReviewQueueSheet  — AI-curated action items, opened from the topbar
 *   - JobWizardModal    — multi-step creator for new job postings
 *
 * Usage:
 *   const { openSheet, openUserProfile, openReviewQueue, openJobWizard } = useProfileSheet();
 *   openSheet(applicationId);
 *   openUserProfile();
 *   openReviewQueue();
 *   openJobWizard();
 */

type SheetCtx = {
  openSheet: (applicationId: string) => void;
  closeSheet: () => void;
  openUserProfile: () => void;
  closeUserProfile: () => void;
  openReviewQueue: () => void;
  closeReviewQueue: () => void;
  openJobWizard: (initialData?: any) => void;
  closeJobWizard: () => void;
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
      openJobWizard: () => {},
      closeJobWizard: () => {},
    };
  }
  return v;
}

export default function SheetHost({
  stages,
  currentUser,
  currentRole,
  userProfile,
  workspaceData,
  children,
}: {
  stages: SheetStage[];
  currentUser: { id: string; name: string; signature: string };
  currentRole?: string;
  userProfile: UserProfileInitial;
  workspaceData: {
    departments: string[];
    locations: string[];
    currency: string;
  };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [userOpen, setUserOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [jobWizOpen, setJobWizOpen] = React.useState(false);

  const value = React.useMemo<SheetCtx>(
    () => ({
      openSheet: (applicationId: string) => setOpenId(applicationId),
      closeSheet: () => setOpenId(null),
      openUserProfile: () => setUserOpen(true),
      closeUserProfile: () => setUserOpen(false),
      openReviewQueue: () => setReviewOpen(true),
      closeReviewQueue: () => setReviewOpen(false),
      openJobWizard: () => setJobWizOpen(true),
      closeJobWizard: () => setJobWizOpen(false),
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
      {jobWizOpen && (
        <JobWizardModal
          departments={workspaceData.departments}
          locations={workspaceData.locations}
          currency={workspaceData.currency}
          onClose={() => setJobWizOpen(false)}
          onDone={() => {
            setJobWizOpen(false);
            router.refresh();
          }}
        />
      )}
    </Ctx.Provider>
  );
}
