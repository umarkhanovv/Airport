import 'server-only';

import crypto from 'node:crypto';

import { env, getAdminPassword, getSessionSecret } from '../env.ts';

/**
 * Admin session: an HMAC-signed cookie, no session store (plan §9.1).
 *
 * There are no user records anywhere in this system (spec §8, §14) — a single
 * environment password gates a single admin. That removes the usual reason for
 * a sessions table: there is no identity to look up, only a yes/no. So the
 * cookie carries its own expiry and a signature proving the server issued it.
 *
 * Deliberately not a JWT. A JWT here would mean a dependency, an algorithm
 * field an attacker can try to influence, and a spec's worth of edge cases, all
 * to encode one boolean and a timestamp. `crypto.createHmac` is in Node.
 */

const COOKIE_NAME = 'hsa_admin';

/**
 * Eight hours: long enough to upload a schedule, correct a mistake and come
 * back after lunch; short enough that a session left open on a shared airport
 * office machine expires the same working day.
 */
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export const adminSession = {
  cookieName: COOKIE_NAME,
  ttlSeconds: SESSION_TTL_SECONDS,
} as const;

interface SessionPayload {
  /** Unix seconds. */
  exp: number;
  /** Unix seconds, issued-at — retained so a token can be reasoned about in logs. */
  iat: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(payload: string): Buffer {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest();
}

/**
 * Constant-time equality that tolerates different lengths.
 *
 * `crypto.timingSafeEqual` throws when the buffers differ in length, and
 * catching that throw reintroduces the timing signal it exists to remove.
 * Hashing both sides first makes every comparison a fixed 32 bytes, so length
 * never reaches the comparison at all.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Verifies a submitted password against `ADMIN_PASSWORD`. Never uses `===`. */
export function verifyPassword(candidate: string): boolean {
  return safeEqual(candidate, getAdminPassword());
}

/** Issues a signed token valid for {@link SESSION_TTL_SECONDS}. */
export function issueSessionToken(now: number = Date.now()): {
  token: string;
  expiresAt: Date;
} {
  const iat = Math.floor(now / 1000);
  const exp = iat + SESSION_TTL_SECONDS;

  const payload = base64url(JSON.stringify({ exp, iat } satisfies SessionPayload));
  const signature = base64url(hmac(payload));

  return { token: `${payload}.${signature}`, expiresAt: new Date(exp * 1000) };
}

/**
 * Returns the payload when the token was signed by this server and has not
 * expired, and `null` in every other case — bad shape, bad signature, expired,
 * unparseable. Callers get no detail about which, because the difference is
 * only ever useful to an attacker.
 */
export function readSessionToken(
  token: string | undefined,
  now: number = Date.now()
): SessionPayload | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = base64url(hmac(payload));
  // Length is public information (both are base64url SHA-256), so checking it
  // before the constant-time compare leaks nothing.
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const { exp, iat } = parsed as Record<string, unknown>;
  if (typeof exp !== 'number' || typeof iat !== 'number') return null;
  if (exp * 1000 <= now) return null;

  return { exp, iat };
}

/** Cookie attributes shared by the set and clear paths. */
export function sessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Only over HTTPS in production. Forcing it in development would make the
    // panel unusable on http://localhost.
    secure: env.isProduction,
    path: '/',
    expires: expiresAt,
  };
}
