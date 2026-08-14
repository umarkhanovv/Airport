import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';

import { JsMarker } from '@/components/js-marker';
import { readAdminLocale } from '@/lib/admin/locale';

import '../globals.css';

/**
 * The admin shell.
 *
 * This renders `<html>` itself because `app/layout.tsx` is a pass-through — the
 * locale tree owns its own document so `lang` can follow the URL. Admin sits
 * outside `[locale]` entirely and supplies its own document here.
 *
 * It is no longer single-language. The panel reads Russian, English or Kazakh
 * from a cookie rather than from the URL (`lib/admin/locale.ts` says why), and
 * `lang` follows that cookie so a screen reader pronounces the panel correctly
 * — the same guarantee the public site gets from its URL prefix.
 *
 * No authentication check lives in this layout, on purpose. A layout does not
 * re-render on client navigation and does not stop the segments below it from
 * rendering, so a check here would look like security without being it. Each
 * page and action calls `requireAdmin()` instead.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readAdminLocale();
  const t = await getTranslations({ locale, namespace: 'Admin.meta' });

  return {
    title: { default: t('default'), template: t('template') },
    // Belt and braces alongside app/robots.ts: an admin page must never be
    // indexed, and a stray link should not be enough to get one crawled.
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const locale = await readAdminLocale();

  /*
   * Only the `Admin` namespace crosses into the client.
   *
   * Six screens in here are client components, and they need `useTranslations`
   * for their pending states and their error text. Handing the provider the
   * whole catalogue would ship the entire public site's strings — three
   * hundred of them, none used — into a bundle behind a login.
   */
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <JsMarker />
      </head>
      {/*
        `admin-shell` turns the backdrop down rather than off. The public site
        is a shop window and can afford atmosphere behind it; this is a
        workbench, where staff read tables of two hundred documents and a
        pattern under dense rows is a cost. Same surfaces, quieter field.
      */}
      <body className="admin-shell text-text flex min-h-screen flex-col">
        <div aria-hidden="true" className="app-backdrop" />
        <NextIntlClientProvider locale={locale} messages={{ Admin: messages.Admin }}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
