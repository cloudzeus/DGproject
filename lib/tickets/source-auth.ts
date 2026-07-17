import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { TicketSource } from "@prisma/client";

/**
 * Authenticate a client app submitting a ticket.
 * Checks: source code exists + active, secret matches bcrypt hash,
 * origin allowed (empty allowlist = allow all).
 * Returns the source on success, or an error discriminant for the HTTP layer.
 */
export async function verifyTicketSource(
  code: string | null,
  key: string | null,
  origin: string | null
): Promise<
  | { ok: true; source: TicketSource }
  | { ok: false; status: 401 | 403; error: string }
> {
  if (!code || !key) {
    return { ok: false, status: 401, error: "missing_credentials" };
  }
  const source = await prisma.ticketSource.findUnique({ where: { code } });
  if (!source || !source.active) {
    return { ok: false, status: 401, error: "unknown_source" };
  }
  const valid = await bcrypt.compare(key, source.secretHash);
  if (!valid) {
    return { ok: false, status: 401, error: "invalid_key" };
  }
  if (!isOriginAllowed(source, origin)) {
    return { ok: false, status: 403, error: "origin_not_allowed" };
  }
  return { ok: true, source };
}

export function isOriginAllowed(
  source: TicketSource,
  origin: string | null
): boolean {
  let allowed: string[] = [];
  try {
    const parsed = JSON.parse(source.originUrls);
    if (Array.isArray(parsed)) allowed = parsed.filter((x) => typeof x === "string");
  } catch {
    allowed = [];
  }
  if (allowed.length === 0) return true; // empty allowlist = allow all (server-to-server)
  if (!origin) return true; // server-to-server calls send no Origin header
  return allowed.some((a) => origin === a || origin.startsWith(a.replace(/\/$/, "")));
}

// ─── In-memory rate limiter ───────────────────────────────────────────
// Good enough for a single-instance deployment; the cron sweeper and DB
// dedup provide the safety net if the process restarts.
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  bucket: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const hits = (buckets.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(bucket, hits);
    return false;
  }
  hits.push(now);
  buckets.set(bucket, hits);
  return true;
}
