// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Glass, Chip, Icons } from "@/components/primitives";

type Job = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employment: string | null;
  salary: string | null;
};

type Office = { city: string; country?: string };

export default function RolesBoard({
  departments,
  offices,
  jobs,
}: {
  departments: string[];
  offices: Office[];
  jobs: Job[];
}) {
  const [filter, setFilter] = React.useState<string>("All teams");
  const [search, setSearch] = React.useState("");

  // Location filter chips are derived from the workspace's configured offices,
  // not from raw `job.location` strings — those tend to include extra context
  // like "London · Hybrid" or "Berlin (Mitte)", which would otherwise pollute
  // the filter row with cities the company isn't actually based in.
  // A "Remote" chip is added automatically when any job's location mentions
  // "remote", since that's modeled as a working arrangement rather than an
  // office on its own.
  const locationFilters = React.useMemo(() => {
    const cities = offices
      .map((o) => (o.city || "").trim())
      .filter((c) => c.length > 0);
    const unique: string[] = [];
    for (const c of cities) {
      if (!unique.some((u) => u.toLowerCase() === c.toLowerCase())) unique.push(c);
    }
    const hasRemote = jobs.some((j) => (j.location || "").toLowerCase().includes("remote"));
    if (hasRemote && !unique.some((u) => u.toLowerCase() === "remote")) unique.push("Remote");
    return unique;
  }, [jobs, offices]);

  function matchesLocationChip(jobLocation: string | null, chip: string) {
    if (!jobLocation) return false;
    const haystack = jobLocation.toLowerCase();
    return haystack.includes(chip.toLowerCase());
  }

  const filtered = React.useMemo(() => {
    return jobs.filter((j) => {
      if (filter !== "All teams") {
        const matchesDept = j.department === filter;
        const matchesLoc = matchesLocationChip(j.location, filter);
        if (!matchesDept && !matchesLoc) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [j.title, j.department, j.location, j.employment].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filter, jobs, search]);

  const chips = ["All teams", ...departments, ...locationFilters];

  return (
    <>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Glass faint className="career-filter">
          {chips.map((label) => (
            <button
              key={label}
              type="button"
              className={`btn btn-sm ${filter === label ? "" : "btn-ghost"}`}
              style={{
                fontSize: 12,
                height: 28,
                background: filter === label ? "var(--glass-bg-strong)" : "transparent",
                border: filter === label ? "0.5px solid var(--glass-border)" : "0.5px solid transparent",
              }}
              onClick={() => setFilter(label)}
            >
              {label}
            </button>
          ))}
        </Glass>
        <Glass faint style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 9, height: 34, flex: 1, minWidth: 200 }}>
          <Icons.Search size={13} style={{ color: "var(--ink-2)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles…"
            style={{ background: "transparent", border: 0, outline: 0, color: "var(--ink-0)", fontSize: 13, width: "100%" }}
          />
        </Glass>
        {(filter !== "All teams" || search) && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setFilter("All teams");
              setSearch("");
            }}
          >
            Clear <Icons.X size={11} />
          </button>
        )}
      </div>

      <Glass strong style={{ overflow: "hidden", borderRadius: 18 }}>
        {filtered.length === 0 && (
          <div style={{ padding: "32px 24px", textAlign: "center" }}>
            <p className="muted">
              {jobs.length === 0 ? "No open roles right now. Check back soon." : "No roles match this filter."}
            </p>
          </div>
        )}
        {filtered.map((j) => (
          <a key={j.id} href={`jobs/${j.slug}`} className="job-row" style={{ textDecoration: "none", color: "inherit" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.015em" }}>{j.title}</div>
              <div className="tiny" style={{ marginTop: 4 }}>
                {[j.department, j.location].filter(Boolean).join(" · ")}
              </div>
            </div>
            {j.location && (
              <span className="chip career-job-meta">
                <Icons.MapPin size={11} stroke={1.8} /> {j.location}
              </span>
            )}
            <span className="tiny mono career-job-meta">{j.employment || "Full-time"}</span>
            <span className="btn btn-sm">
              {j.salary || "View role"} <Icons.ArrowRight size={11} stroke={2} />
            </span>
          </a>
        ))}
      </Glass>

      {filtered.length > 0 && (filter !== "All teams" || search) && (
        <div className="tiny" style={{ marginTop: 10, textAlign: "right" }}>
          Showing {filtered.length} of {jobs.length} {jobs.length === 1 ? "role" : "roles"}
        </div>
      )}
    </>
  );
}
