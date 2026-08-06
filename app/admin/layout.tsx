import type { Metadata } from 'next';

import { ThemeScript } from '@/components/theme-script';

import '../globals.css';

/**
 * The admin shell.
 *
 * This renders `<html>` itself because `app/layout.tsx` is a pass-through — the
 * locale tree owns its own document so `lang` can follow the URL. Admin is
 * staff-only and single-language, so it sits outside `[locale]` entirely and
 * supplies its own document here.
 *
 * No authentication check lives in this layout, on purpose. A layout does not
 * re-render on client navigation and does not stop the segments below it from
 * rendering, so a check here would look like security without being it. Each
 * page and action calls `requireAdmin()` instead.
 */

export const metadata: Metadata = {
  title: {
    default: 'Admin — Turkistan International Airport',
    template: '%s — Admin',
  },
  // Belt and braces alongside app/robots.ts: an admin page must never be
  // indexed, and a stray link should not be enough to get one crawled.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-surface-sunken text-text flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
