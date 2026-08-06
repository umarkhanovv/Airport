import { beforeEach, describe, expect, it } from 'vitest';

import { __resetAllBuckets, consumeLoginAttempt, resetLoginAttempts } from '@/lib/admin/rate-limit';

/**
 * A single env password is the whole authentication surface (spec §8, §14), so
 * the only thing standing between it and an offline-speed guessing attack is
 * this bucket (plan §9.1).
 */

const T0 = Date.parse('2026-01-01T12:00:00Z');

beforeEach(() => {
  __resetAllBuckets();
});

describe('consumeLoginAttempt', () => {
  it('allows a burst of five, then blocks', () => {
    for (let i = 0; i < 5; i++) {
      expect(consumeLoginAttempt('1.2.3.4', T0).allowed, `attempt ${i + 1}`).toBe(true);
    }

    const blocked = consumeLoginAttempt('1.2.3.4', T0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it('keeps buckets independent per key', () => {
    for (let i = 0; i < 5; i++) consumeLoginAttempt('1.2.3.4', T0);

    expect(consumeLoginAttempt('1.2.3.4', T0).allowed).toBe(false);
    // A different address is unaffected — one attacker must not lock out staff.
    expect(consumeLoginAttempt('5.6.7.8', T0).allowed).toBe(true);
  });

  it('refills one token per 30s', () => {
    for (let i = 0; i < 5; i++) consumeLoginAttempt('1.2.3.4', T0);
    expect(consumeLoginAttempt('1.2.3.4', T0).allowed).toBe(false);

    // Not quite a full interval later: still blocked.
    expect(consumeLoginAttempt('1.2.3.4', T0 + 29_000).allowed).toBe(false);

    // One interval: exactly one attempt back.
    expect(consumeLoginAttempt('1.2.3.4', T0 + 30_000).allowed).toBe(true);
    expect(consumeLoginAttempt('1.2.3.4', T0 + 30_000).allowed).toBe(false);
  });

  it('refills to no more than the burst capacity', () => {
    for (let i = 0; i < 5; i++) consumeLoginAttempt('1.2.3.4', T0);

    // A day later the bucket is full again, but not deeper than full.
    const muchLater = T0 + 24 * 60 * 60 * 1000;
    for (let i = 0; i < 5; i++) {
      expect(consumeLoginAttempt('1.2.3.4', muchLater).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(consumeLoginAttempt('1.2.3.4', muchLater).allowed).toBe(false);
  });

  it('spends a token on every attempt, not only on failures', () => {
    // The action calls this before checking the password precisely so that a
    // correct-password probe cannot be used to hammer the endpoint for free.
    const first = consumeLoginAttempt('1.2.3.4', T0);
    expect(first.remaining).toBe(4);
  });
});

describe('resetLoginAttempts', () => {
  it('restores a full bucket after a successful login', () => {
    for (let i = 0; i < 5; i++) consumeLoginAttempt('1.2.3.4', T0);
    expect(consumeLoginAttempt('1.2.3.4', T0).allowed).toBe(false);

    resetLoginAttempts('1.2.3.4');

    expect(consumeLoginAttempt('1.2.3.4', T0).allowed).toBe(true);
  });
});
