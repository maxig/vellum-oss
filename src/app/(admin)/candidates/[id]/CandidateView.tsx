// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Glass, Avatar, Icons } from "@/components/primitives";
import { relativeTime } from "@/lib/utils";
import ProfileSheet from "@/components/ProfileSheet";

type Application = {
  id: string;
  jobId: string;
  jobTitle: string;
  stageKey: string;
  stageName: string;
  stageColor: string;
  aiFit: number | null;
  aiSummary: string | null;
  whyUs: string | null;
  resumeUrl: string | null;
  appliedAt: string;
  interviews: { id: string; scheduledAt: string; kind: string; durationMin: number }[];
};

export default function CandidateView({
  currentUser,
  currentRole,
  candidate,
  applications,
  stages,
}: {
  currentUser: { id: string; name: string; signature: string };
  currentRole?: string;
  candidate: {
    id: string; name: string; email: string | null; location: string | null;
    linkedin: string | null; portfolio: string | null; github: string | null;
    currentRole: string | null; years: number | null; source: string | null;
    skills: string[]; createdAt: string;
  };
  applications: Application[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
  stages: { id: string; key: string; name: string; color: string }[];
  threadId: string | null;
}) {
  const router = useRouter();

  const [activeAppId, setActiveAppId] = React.useState<string | null>(
    applications[0]?.id || null,
  );

  // Keep the active application in sync when the data revalidates.
  React.useEffect(() => {
    if (!applications.find((a) => a.id === activeAppId)) {
      setActiveAppId(applications[0]?.id || null);
    }
  }, [applications, activeAppId]);

  function closeSheet() {
    router.push("/candidates");
  }

  // Orphan candidates — those with no application yet — can't be shown
  // through ProfileSheet (it loads /api/applications/[id]/sheet). Render
  // a minimal profile + a link back to the database for those.
  if (applications.length === 0 || !activeAppId) {
    return (
      <div className="page">
        <Link href="/candidates" className="tiny" style={{ color: "var(--ink-2)" }}>← All candidates</Link>
        <div className="row" style={{ marginTop: 14, marginBottom: 22, gap: 18 }}>
          <Avatar name={candidate.name} size="xl" />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 28 }}>{candidate.name}</h1>
            <div className="row" style={{ gap: 10, marginTop: 6, flexWrap: "wrap" }}>
              {candidate.location && <span className="tiny muted"><Icons.MapPin size={11} /> {candidate.location}</span>}
              {candidate.email && (
                <a className="tiny" href={`mailto:${candidate.email}`} style={{ color: "var(--accent-solid)" }}>{candidate.email}</a>
              )}
            </div>
          </div>
        </div>
        <Glass className="card" style={{ padding: 22 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            {candidate.name} doesn't have any applications yet. Attach them to a job from the candidates database
            to see the full applicant view.
          </p>
        </Glass>
      </div>
    );
  }

  return (
    <>
      {/* Render multiple applications by reusing the same ProfileSheet — the
          user can switch between them via the picker below the sheet header.
          We keep the sheet mounted on the page so the URL acts as a permalink
          to the candidate's full profile. */}
      <ProfileSheet
        key={activeAppId}
        applicationId={activeAppId}
        stages={stages}
        currentUser={currentUser}
        currentRole={currentRole}
        onClose={closeSheet}
        onChanged={() => router.refresh()}
      />

      {applications.length > 1 && (
        <div
          style={{
            position: "fixed",
            left: 22,
            bottom: 22,
            zIndex: 110,
            padding: 8,
            borderRadius: 12,
            background: "var(--glass-bg-strong)",
            border: "0.5px solid var(--glass-border)",
            backdropFilter: "blur(20px) saturate(160%)",
            display: "flex",
            gap: 6,
            alignItems: "center",
            maxWidth: 420,
            flexWrap: "wrap",
          }}
        >
          <span className="tiny" style={{ marginRight: 4 }}>Applications</span>
          {applications.map((a) => (
            <button
              key={a.id}
              className={`btn btn-sm ${a.id === activeAppId ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveAppId(a.id)}
              title={`Applied ${relativeTime(a.appliedAt)}`}
            >
              {a.jobTitle}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
