import 'server-only';

/**
 * In-memory token buckets (plan §9.1).
 *
 * No Redis, no external dependency — the self-hosting constraint means one Node
 * process on one box, so process memory *is* the shared store. Behind more than
 * one instance the limit becomes per-instance, which degrades gracefully: an
 * attacker gains a linear factor, not an exemption.
 *
 * Two callers use this with very different settings: admin login wants a short
 * fuse on a burst of password guesses, feedback wants a long one on submission
 * floods. Both want the same algorithm, so it lives here once.
 */

export interface BucketOptions {
  /** Attempts allowed in a burst before the bucket runs dry. */
  capacity: number;
  /** How long one token takes to come back. */
  refillIntervalMs: number;
  /** Buckets idle for this long are dropped, so the map cannot grow forever. */
  idleEvictionMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the next token, when `allowed` is false. */
  retryAfterSeconds: number;
  remaining: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiter {
  /** Spends one token for `key`. */
  consume(key: string, now?: number): RateLimitResult;
  /** Clears one key — used after a success, so a typo does not linger. */
  reset(key: string): void;
  /** Test seam: the module-level map would otherwise leak between cases. */
  clear(): void;
}

export function createRateLimiter({
  capacity,
  refillIntervalMs,
  idleEvictionMs = 60 * 60 * 1000,
}: BucketOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function evictIdle(now: number): void {
    for (const [key, bucket] of buckets) {
      if (now - bucket.updatedAt > idleEvictionMs) buckets.delete(key);
    }
  }

  return {
    consume(key: string, now: number = Date.now()): RateLimitResult {
      evictIdle(now);

      const existing = buckets.get(key);
      const bucket: Bucket = existing ?? { tokens: capacity, updatedAt: now };

      if (existing) {
        const refilled = Math.floor((now - existing.updatedAt) / refillIntervalMs);
        if (refilled > 0) {
          bucket.tokens = Math.min(capacity, existing.tokens + refilled);
          bucket.updatedAt = existing.updatedAt + refilled * refillIntervalMs;
        }
      }

      if (bucket.tokens <= 0) {
        buckets.set(key, bucket);
        const elapsed = now - bucket.updatedAt;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((refillIntervalMs - elapsed) / 1000)),
          remaining: 0,
        };
      }

      bucket.tokens -= 1;
      // Anchor the refill clock on the first spend from a full bucket, so a
      // burst does not each carry its own independent timer.
      if (bucket.tokens === capacity - 1) bucket.updatedAt = now;
      buckets.set(key, bucket);

      return { allowed: true, retryAfterSeconds: 0, remaining: bucket.tokens };
    },

    reset(key: string): void {
      buckets.delete(key);
    },

    clear(): void {
      buckets.clear();
    },
  };
}
