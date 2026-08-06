import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetFeedbackLimiter,
  checkFormToken,
  consumeFeedbackAttempt,
  hashIp,
  isHoneypotTripped,
  issueFormToken,
} from '@/lib/feedback/antispam';

/**
 * Feedback anti-spam (spec §9, plan §9.1).
 *
 * The spec rules out captchas, so these three cheap checks are the whole
 * defence. The one that carries the most weight is the signed timestamp: an
 * unsigned one is a number the sender chooses.
 */

const T0 = Date.parse('2026-01-01T12:00:00Z');

beforeEach(() => {
  process.env.SESSION_SECRET = 'feedback-test-secret';
  __resetFeedbackLimiter();
});

describe('form token time-trap', () => {
  it('accepts a token submitted after a human pause', () => {
    const token = issueFormToken(T0);
    expect(checkFormToken(token, T0 + 5_000)).toBe('ok');
  });

  it('rejects an instant submission', () => {
    const token = issueFormToken(T0);
    expect(checkFormToken(token, T0 + 200)).toBe('too-fast');
    expect(checkFormToken(token, T0 + 1_999)).toBe('too-fast');
    expect(checkFormToken(token, T0 + 2_000)).toBe('ok');
  });

  it('rejects a form left open overnight', () => {
    const token = issueFormToken(T0);
    const oneDay = 24 * 60 * 60 * 1000;
    expect(checkFormToken(token, T0 + oneDay + 1)).toBe('expired');
  });

  it('rejects a forged timestamp, which is the entire point of signing it', () => {
    // A bot that simply claims the form was rendered two minutes ago.
    const forged = `${T0 - 120_000}.notarealsignature`;
    expect(checkFormToken(forged, T0)).toBe('missing');

    // Or reuses a real signature with a different timestamp.
    const real = issueFormToken(T0);
    const signature = real.split('.')[1];
    expect(checkFormToken(`${T0 - 120_000}.${signature}`, T0)).toBe('missing');
  });

  it('rejects a token signed with a different secret', () => {
    const token = issueFormToken(T0);
    process.env.SESSION_SECRET = 'a-different-secret';
    expect(checkFormToken(token, T0 + 5_000)).toBe('missing');
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of [undefined, '', 'no-dot', 'a.b.c', '.', `${T0}.`]) {
      expect(checkFormToken(bad, T0 + 5_000), String(bad)).toBe('missing');
    }
  });

  it('works with no SESSION_SECRET at all, since the public form must', () => {
    // spec §9: the form works with zero configuration from the airport.
    delete process.env.SESSION_SECRET;
    const token = issueFormToken(T0);
    expect(checkFormToken(token, T0 + 5_000)).toBe('ok');
  });
});

describe('honeypot', () => {
  it('trips only when the hidden field carries content', () => {
    expect(isHoneypotTripped('http://spam.example')).toBe(true);
    expect(isHoneypotTripped('')).toBe(false);
    expect(isHoneypotTripped('   ')).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped(undefined)).toBe(false);
  });
});

describe('hashIp', () => {
  it('is stable for one address and different across addresses', () => {
    expect(hashIp('203.0.113.5')).toBe(hashIp('203.0.113.5'));
    expect(hashIp('203.0.113.5')).not.toBe(hashIp('203.0.113.6'));
  });

  it('never contains the address it was derived from', () => {
    // plan §9.1: hashed, never raw.
    const ip = '203.0.113.5';
    const hashed = hashIp(ip);
    expect(hashed).not.toContain(ip);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('submission rate limit', () => {
  it('allows a burst of five then holds the sixth', () => {
    for (let i = 0; i < 5; i++) {
      expect(consumeFeedbackAttempt('203.0.113.5', T0).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(consumeFeedbackAttempt('203.0.113.5', T0).allowed).toBe(false);
  });

  it('keeps one sender from locking out another', () => {
    for (let i = 0; i < 5; i++) consumeFeedbackAttempt('203.0.113.5', T0);
    expect(consumeFeedbackAttempt('203.0.113.5', T0).allowed).toBe(false);
    expect(consumeFeedbackAttempt('198.51.100.9', T0).allowed).toBe(true);
  });

  it('lets one message back through every ten minutes', () => {
    for (let i = 0; i < 5; i++) consumeFeedbackAttempt('203.0.113.5', T0);

    expect(consumeFeedbackAttempt('203.0.113.5', T0 + 9 * 60_000).allowed).toBe(false);
    expect(consumeFeedbackAttempt('203.0.113.5', T0 + 10 * 60_000).allowed).toBe(true);
  });
});
