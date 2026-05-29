// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: false,
  serverExternalPackages: ["pdf-parse-new"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: { unoptimized: true },
  async rewrites() {
    return [
      // Resume URLs are stored as /uploads/<file> for nice display, but the
      // handler that serves them lives under /api/uploads/<file>.
      { source: "/uploads/:file", destination: "/api/uploads/:file" },
    ];
  },
};

export default nextConfig;
