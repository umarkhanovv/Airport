'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { assertSameOrigin, clientIp } from '@/lib/admin/auth';
import { consumeLoginAttempt, resetLoginAttempts } from '@/lib/admin/rate-limit';
import {
  adminSession,
  issueSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/admin/session';
import { getAdminPassword, getSessionSecret } from '@/lib/env';

export interface LoginState {
  error?: string;
}

/**
 * Only same-site admin paths are accepted as a post-login destination, so a
 * crafted `?next=` cannot turn the login screen into an open redirect.
 */
function safeReturnTo(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string') return '/admin';
  if (!raw.startsWith('/admin') || raw.startsWith('//')) return '/admin';
  return raw;
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  await assertSameOrigin();

  // Both secrets are read up front. lib/env.ts deliberately defers these throws
  // to first use so builds need no secrets — which means an unconfigured server
  // reaches this action and should answer with a sentence, not a 500.
  try {
    getAdminPassword();
    getSessionSecret();
  } catch {
    return {
      error:
        'Admin access is not configured on this server. Set ADMIN_PASSWORD and SESSION_SECRET.',
    };
  }

  const ip = await clientIp();

  // Spend a token before checking the password. Limiting only failures would
  // still allow unlimited timing probes at full speed.
  const limit = consumeLoginAttempt(ip);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` };
  }

  const password = formData.get('password');
  if (typeof password !== 'string' || password === '') {
    return { error: 'Enter the admin password.' };
  }

  if (!verifyPassword(password)) {
    return { error: 'Incorrect password.' };
  }

  const { token, expiresAt } = issueSessionToken();
  const store = await cookies();
  store.set(adminSession.cookieName, token, sessionCookieOptions(expiresAt));

  resetLoginAttempts(ip);

  // Outside any try/catch — redirect() signals by throwing.
  redirect(safeReturnTo(formData.get('next')));
}

export async function logout(): Promise<void> {
  await assertSameOrigin();

  const store = await cookies();
  store.delete(adminSession.cookieName);

  redirect('/admin/login');
}
