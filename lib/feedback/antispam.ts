import 'server-only';

import crypto from 'node:crypto';

import { createRateLimiter } from '../rate-limit.ts';

import { FORM_TOKEN_FIELD, HONEYPOT_FIELD } from './field-names.ts';

/**
 * Feedback anti-spam (spec §9, plan §9.1).
 *
 * The spec asks for minimal protection and explicitly rules out heavy captchas:
 * this form is how a member of the public reports that a door is broken, and a
 * puzzle gate between them and that is a worse outcome than some spam. So there
 * are three cheap, invisible defences and no challenge of any kind.
 *
 *   1. a honeypot field a human never sees
 *   2. a time-trap — a signed render timestamp, rejecting instant submissions
 *   3. a per-IP token bucket
 */

export { FORM_TOKEN_FIELD, HONEYPOT_FIELD };

/**
 * Nobody reads a form, types a name and a paragraph, and submits inside two
 * seconds. Anything faster did not read it.
 */
const MIN_ELAPSED_MS = 2_000;

/** A form left open overnight is stale; the visitor should reload. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Signing key for the render timestamp and the IP hash.
 *
 * `SESSION_SECRET` when it is set, because that is stable across restarts and
 * across instances. When it is not — a development machine, or an airport that
 * has not configured the admin panel yet — a per-process random key. The public
 * form must work with zero configuration (spec §9), so a missing secret cannot
 * be allowed to throw here.
 *
 * The fallback's only cost is that a restart invalidates forms rendered before
 * it, and that IP hashes do not correlate across a restart. Both are acceptable
 * for a spam heuristic; neither is acceptable for the admin session, which is
 * why that one requires the real secret.
 */
const processKey = crypto.randomBytes(32);

function signingKey(): crypto.BinaryLike {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured !== '' ? configured : processKey;
}

/** Issued when the form renders, verified when it is submitted. */
export function issueFormToken(now: number = Date.now()): string {
  const issuedAt = String(now);
  const signature = crypto.createHmac('sha256', signingKey()).update(issuedAt).digest('base64url');

  return `${issuedAt}.${signature}`;
}

export type FormTokenVerdict = 'ok' | 'missing' | 'too-fast' | 'expired';

/**
 * Verifies the render timestamp.
 *
 * Signing it is the point. An unsigned timestamp is a number the client
 * controls, so a bot would simply post one from two minutes ago and the
 * time-trap would catch nothing.
 */
export function checkFormToken(
  raw: FormDataEntryValue | null | undefined,
  now: number = Date.now()
): FormTokenVerdict {
  if (typeof raw !== 'string') return 'missing';

  const parts = raw.split('.');
  if (parts.length !== 2) return 'missing';

  const [issuedAt, signature] = parts;
  if (!issuedAt || !signature) return 'missing';

  const expected = crypto.createHmac('sha256', signingKey()).update(issuedAt).digest('base64url');

  if (signature.length !== expected.length) return 'missing';
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return 'missing';

  const rendered = Number(issuedAt);
  if (!Number.isFinite(rendered)) return 'missing';

  const elapsed = now - rendered;
  // A negative elapsed means a clock skew or a replayed future timestamp.
  if (elapsed < MIN_ELAPSED_MS) return 'too-fast';
  if (elapsed > MAX_AGE_MS) return 'expired';

  return 'ok';
}

/** True when the honeypot was filled in, i.e. the sender is not a person. */
export function isHoneypotTripped(raw: FormDataEntryValue | null | undefined): boolean {
  return typeof raw === 'string' && raw.trim() !== '';
}

/**
 * Hashes the sender's IP (plan §9.1 — hashed, never raw).
 *
 * Staff need to recognise a flood from one source; a hash does that just as
 * well as an address. Storing the address itself would turn this table into a
 * small pile of personal data with no added operational value.
 */
export function hashIp(ip: string): string {
  return crypto.createHmac('sha256', signingKey()).update(ip).digest('hex');
}

/**
 * Five submissions, then one back every ten minutes. Loose enough that a family
 * complaining about the same flight is unaffected; tight enough that a script
 * cannot fill the inbox.
 */
const submissionLimiter = createRateLimiter({
  capacity: 5,
  refillIntervalMs: 10 * 60 * 1000,
});

export function consumeFeedbackAttempt(key: string, now: number = Date.now()) {
  return submissionLimiter.consume(key, now);
}

/** Test seam. */
export function __resetFeedbackLimiter(): void {
  submissionLimiter.clear();
}
