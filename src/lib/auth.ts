// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import type { NextAuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name?: string | null; image?: string | null } & DefaultSession["user"];
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) return null;
        const email = credentials.email.toLowerCase().trim();

        // Throttle brute-force guessing. Per-email lockout is the primary
        // guard; a coarser per-IP cap blunts password-spraying across many
        // accounts. Both count every attempt and the email counter is cleared
        // on success, so an honest user who mistypes a couple of times isn't
        // penalised on their next login.
        const fwd = (req?.headers?.["x-forwarded-for"] as string | undefined) || "";
        const ip = fwd.split(",")[0]?.trim() || "unknown";
        const emailGate = rateLimit(`login:${email}`, { limit: 10, windowMs: 15 * 60 * 1000 });
        const ipGate = rateLimit(`login-ip:${ip}`, { limit: 50, windowMs: 15 * 60 * 1000 });
        if (!emailGate.ok || !ipGate.ok) {
          throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.");
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;
        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;
        rateLimitReset(`login:${email}`);
        return { id: user.id, email: user.email, name: user.name ?? undefined, image: user.image ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? null;
      }
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
