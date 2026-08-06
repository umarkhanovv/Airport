import 'server-only';

/**
 * Login rate limiting: an in-memory token bucket keyed by IP (plan §9.1).
 *
 * No Redis, no external dependency — the self-hosting constraint means one Node
 * process on one box, so process memory *is* the shared store. If this ever
 * runs behind more than one instance the limit becomes per-instance, which
 * degrades gracefully: an attacker gains a linear factor, not an exemption.
 *
 * The single admin password is the whole authentication surface here, so the
 * point of this is bluntly to make guessing it slow.
 */

/** Attempts allowed in a burst before the bucket runs dry. */
const CAPACITY = 5;

/** One token back per 30s — a wrong password costs half a minute. */
const REFILL_INTERVAL_MS = 30_000;

/** Buckets idle for this long are dropped, so the map cannot grow forever. */
const IDLE_EVICTION_MS = 60 * 60 * 1000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the next token, when `allowed` is false. */
  retryAfterSeconds: number;
  remaining: number;
}

function evictIdle(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > IDLE_EVICTION_MS) buckets.delete(key);
  }
}

/**
 * Spends one token for `key`. Call this on every login *attempt*, before the
 * password is checked — rate limiting that only counts failures still lets an
 * attacker measure timing on unlimited requests.
 */
export function consumeLoginAttempt(key: string, now: number = Date.now()): RateLimitResult {
  evictIdle(now);

  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: CAPACITY, updatedAt: now };

  if (existing) {
    const refilled = Math.floor((now - existing.updatedAt) / REFILL_INTERVAL_MS);
    if (refilled > 0) {
      bucket.tokens = Math.min(CAPACITY, existing.tokens + refilled);
      bucket.updatedAt = existing.updatedAt + refilled * REFILL_INTERVAL_MS;
    }
  }

  if (bucket.tokens <= 0) {
    buckets.set(key, bucket);
    const elapsed = now - bucket.updatedAt;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((REFILL_INTERVAL_MS - elapsed) / 1000)),
      remaining: 0,
    };
  }

  bucket.tokens -= 1;
  // Anchor the refill clock on first spend from a full bucket, so a burst of
  // five does not each carry its own independent 30s timer.
  if (bucket.tokens === CAPACITY - 1) bucket.updatedAt = now;
  buckets.set(key, bucket);

  return { allowed: true, retryAfterSeconds: 0, remaining: bucket.tokens };
}

/** Clears a bucket after a successful login, so a typo does not linger. */
export function resetLoginAttempts(key: string): void {
  buckets.delete(key);
}

/** Test seam — the module-level map would otherwise leak between test cases. */
export function __resetAllBuckets(): void {
  buckets.clear();
}
