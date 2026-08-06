import 'server-only';

import { cache } from 'react';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { adminSession, readSessionToken } from './session.ts';

/**
 * The admin data-access layer (plan §9.1).
 *
 * Every admin page, Server Action and Route Handler calls one of these before
 * touching data. Notably the admin *layout* does not: Next's docs are explicit
 * that a layout does not re-render on navigation and does not gate the segments
 * below it, so a check there would be decoration. The check belongs next to the
 * data, in every entry point, which is why these are cheap and memoised.
 */

/** True when the request carries a valid, unexpired session cookie. */
export const isAdminAuthenticated = cache(async (): Promise<boolean> => {
  const store = await cookies();
  return readSessionToken(store.get(adminSession.cookieName)?.value) !== null;
});

/**
 * Gate for admin pages. Redirects to the login screen when unauthenticated.
 *
 * `next` carries the path the user was trying to reach so login can bounce them
 * back to it.
 */
export async function requireAdmin(returnTo?: string): Promise<void> {
  if (await isAdminAuthenticated()) return;

  const target = returnTo && returnTo.startsWith('/admin') ? returnTo : undefined;
  redirect(target ? `/admin/login?next=${encodeURIComponent(target)}` : '/admin/login');
}

/**
 * Client IP for rate limiting.
 *
 * `x-forwarded-for` is attacker-controlled unless a reverse proxy overwrites
 * it, which is exactly the documented deployment (plan §3.4 — nginx or Caddy in
 * front of plain Node). Deployed without that proxy, the rate limiter can be
 * evaded by spoofing the header; it cannot be *tightened* into locking someone
 * else out, because the key only ever restricts the spoofer's own bucket.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();

  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return h.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Explicit same-origin check on mutating actions (plan §9.1).
 *
 * Next.js already compares Origin against Host for Server Actions. This is a
 * deliberate second lock: the framework's check is configuration-dependent, and
 * the actions below it publish the flight schedule for a live airport.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  const host = h.get('host');

  // Same-origin form posts from some browsers omit Origin entirely; the
  // framework check and SameSite=Lax cover that case.
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error('Rejected: malformed Origin header.');
  }

  if (!host || originHost !== host) {
    throw new Error('Rejected: cross-origin request to an admin action.');
  }
}
