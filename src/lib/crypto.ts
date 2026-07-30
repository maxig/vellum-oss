// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * AES-256-GCM symmetric encryption for at-rest secrets (IMAP/SMTP passwords,
 * API keys, etc).
 *
 * The key is derived from `VELLUM_SECRET` (or `NEXTAUTH_SECRET` as a fallback)
 * via SHA-256. The same secret must survive across restarts, otherwise stored
 * ciphertext becomes unreadable.
 *
 * Output format: base64 of `iv(12) || tag(16) || ciphertext`.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const secret = process.env.VELLUM_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // Refuse to derive a key from a hardcoded default in production. Writing
      // secrets under a guessable key is worse than failing: a missing secret
      // here is a deployment error. decryptSecret() swallows this throw and
      // returns "" so reads degrade gracefully; encryptSecret() surfaces it so
      // no weak ciphertext is ever written.
      throw new Error(
        "VELLUM_SECRET (or NEXTAUTH_SECRET) must be set in production for at-rest encryption",
      );
    }
    // Dev-only fallback so first-time clones don't crash before the user sets
    // a secret.
    return createHash("sha256").update("vellum-development-key-please-set-NEXTAUTH_SECRET").digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return "";
  try {
    const buf = Buffer.from(ciphertext, "base64");
    if (buf.length < IV_LEN + TAG_LEN) return "";
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}
