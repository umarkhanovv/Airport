import 'server-only';

import { createRateLimiter, type RateLimitResult } from '../rate-limit.ts';

/**
 * Login rate limiting (plan §9.1).
 *
 * The single admin password is the whole authentication surface here, so the
 * point of this is bluntly to make guessing it slow. The bucket algorithm lives
 * in `lib/rate-limit.ts`; only the settings are admin-specific.
 */
const loginLimiter = createRateLimiter({
  /** Attempts allowed in a burst before the bucket runs dry. */
  capacity: 5,
  /** One token back per 30s — a wrong password costs half a minute. */
  refillIntervalMs: 30_000,
});

export type { RateLimitResult };

/**
 * Spends one token for `key`. Call this on every login *attempt*, before the
 * password is checked — rate limiting that only counts failures still lets an
 * attacker measure timing on unlimited requests.
 */
export function consumeLoginAttempt(key: string, now: number = Date.now()): RateLimitResult {
  return loginLimiter.consume(key, now);
}

/** Clears a bucket after a successful login, so a typo does not linger. */
export function resetLoginAttempts(key: string): void {
  loginLimiter.reset(key);
}

/** Test seam — the module-level map would otherwise leak between test cases. */
export function __resetAllBuckets(): void {
  loginLimiter.clear();
}
