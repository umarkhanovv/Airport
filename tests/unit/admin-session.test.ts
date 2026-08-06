import { beforeEach, describe, expect, it } from 'vitest';

import {
  adminSession,
  issueSessionToken,
  readSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/admin/session';

/**
 * The admin session cookie is the entire access control for the panel that
 * publishes the airport's flight schedule (plan §9.1). These tests assert the
 * properties that make it worth anything: a token this server did not sign is
 * refused, and an expired one is refused.
 */

const SECRET = 'test-session-secret-value';

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.ADMIN_PASSWORD = 'correct horse battery staple';
});

describe('issueSessionToken / readSessionToken', () => {
  it('reads back a token it just issued', () => {
    const { token, expiresAt } = issueSessionToken();

    const payload = readSessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.exp * 1000).toBe(expiresAt.getTime());
    expect(payload!.exp - payload!.iat).toBe(adminSession.ttlSeconds);
  });

  it('refuses a token signed with a different secret', () => {
    const { token } = issueSessionToken();

    process.env.SESSION_SECRET = 'a-completely-different-secret';
    expect(readSessionToken(token)).toBeNull();
  });

  it('refuses a tampered signature', () => {
    const { token } = issueSessionToken();
    const [payload, signature] = token.split('.');

    // Flip one character of the signature.
    const flipped = (signature![0] === 'A' ? 'B' : 'A') + signature!.slice(1);
    expect(readSessionToken(`${payload}.${flipped}`)).toBeNull();
  });

  it('refuses a payload edited to extend the expiry', () => {
    const { token } = issueSessionToken();
    const [, signature] = token.split('.');

    // The attack this is built to stop: rewrite exp, keep the old signature.
    const forged = Buffer.from(JSON.stringify({ exp: 4_102_444_800, iat: 0 }), 'utf8').toString(
      'base64url'
    );

    expect(readSessionToken(`${forged}.${signature}`)).toBeNull();
  });

  it('refuses an expired token even though the signature is valid', () => {
    const issuedAt = Date.parse('2026-01-01T00:00:00Z');
    const { token } = issueSessionToken(issuedAt);

    // One second past expiry.
    const justExpired = issuedAt + adminSession.ttlSeconds * 1000 + 1000;
    expect(readSessionToken(token, justExpired)).toBeNull();

    // Still valid a minute before.
    const stillValid = issuedAt + adminSession.ttlSeconds * 1000 - 60_000;
    expect(readSessionToken(token, stillValid)).not.toBeNull();
  });

  it('refuses malformed input without throwing', () => {
    for (const bad of [
      undefined,
      '',
      'no-dot',
      'too.many.dots',
      '.',
      'a.',
      '.b',
      'not-base64!.also-not',
    ]) {
      expect(readSessionToken(bad), `${String(bad)} must not authenticate`).toBeNull();
    }
  });

  it('refuses a validly signed payload that is not a session object', () => {
    // Signed by us, but carrying JSON without exp/iat — a shape confusion the
    // signature check alone would happily wave through.
    const { token } = issueSessionToken();
    const [, signature] = token.split('.');
    const payload = Buffer.from(JSON.stringify({ admin: true }), 'utf8').toString('base64url');

    expect(readSessionToken(`${payload}.${signature}`)).toBeNull();
  });
});

describe('verifyPassword', () => {
  it('accepts the configured password', () => {
    expect(verifyPassword('correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyPassword('hunter2')).toBe(false);
  });

  it('rejects passwords of a different length without throwing', () => {
    // timingSafeEqual throws on length mismatch; hashing first is what stops
    // that throw from becoming a timing oracle.
    expect(() => verifyPassword('')).not.toThrow();
    expect(verifyPassword('')).toBe(false);
    expect(verifyPassword('correct horse battery staple!!!!!!!!!!')).toBe(false);
    expect(verifyPassword('correct horse battery stapl')).toBe(false);
  });
});

describe('sessionCookieOptions', () => {
  it('is httpOnly and SameSite=Lax', () => {
    const options = sessionCookieOptions(new Date());
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
  });

  it('is not Secure under test, so localhost development works', () => {
    // NODE_ENV is 'test' here; the production build flips this on.
    expect(sessionCookieOptions().secure).toBe(false);
  });
});
