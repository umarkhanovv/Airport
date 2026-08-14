import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { isAdminAuthenticated } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';

import { AdminLocaleSwitcher } from '../locale-switcher';

import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('signIn') };
}

/** Reads the session cookie, so it must never be prerendered. */
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({ searchParams }: PageProps<'/admin/login'>) {
  if (await isAdminAuthenticated()) {
    redirect('/admin');
  }

  const { next } = await searchParams;
  const returnTo = typeof next === 'string' && next.startsWith('/admin') ? next : undefined;

  const locale = await readAdminLocale();
  const t = await getTranslations({ locale, namespace: 'Admin.login' });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <div className="panel p-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          {/*
            The switcher is here too, and the language cookie deliberately
            outlives the session — otherwise the one screen nobody can reach
            while signed in would be the one screen stuck in the default
            language.
          */}
          <AdminLocaleSwitcher locale={locale} back="/admin/login" />
        </div>
        <p className="text-text-muted mt-1 mb-6 text-sm">{t('intro')}</p>

        <LoginForm returnTo={returnTo} />
      </div>
    </main>
  );
}
