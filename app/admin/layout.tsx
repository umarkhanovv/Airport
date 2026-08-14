import type { Metadata } from 'next';

import { JsMarker } from '@/components/js-marker';

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
        {children}
      </body>
    </html>
  );
}
