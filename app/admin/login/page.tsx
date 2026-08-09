import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { isAdminAuthenticated } from '@/lib/admin/auth';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

/** Reads the session cookie, so it must never be prerendered. */
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({ searchParams }: PageProps<'/admin/login'>) {
  if (await isAdminAuthenticated()) {
    redirect('/admin');
  }

  const { next } = await searchParams;
  const returnTo = typeof next === 'string' && next.startsWith('/admin') ? next : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <div className="glass rounded-xl p-6">
        <h1 className="text-xl font-semibold">Airport admin</h1>
        <p className="text-text-muted mt-1 mb-6 text-sm">
          Staff access for publishing the weekly flight schedule.
        </p>

        <LoginForm returnTo={returnTo} />
      </div>
    </main>
  );
}
