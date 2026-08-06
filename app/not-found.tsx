import Link from 'next/link';

import { routing } from '@/i18n/routing';
import messages from '@/messages/ru.json';

import './globals.css';

/**
 * 404 for requests that never resolved to a locale at all (for example a
 * malformed prefix). Localised 404s live in `app/[locale]/not-found.tsx`.
 *
 * This renders its own <html> because it sits above the locale layout, and
 * falls back to Russian — the default locale.
 */
export default function GlobalNotFound() {
  return (
    <html lang={routing.defaultLocale}>
      <body className="flex min-h-screen items-center justify-center p-6">
        <main className="max-w-md text-center">
          <p className="text-brand-text-strong text-5xl font-semibold">404</p>
          <h1 className="text-text mt-4 text-2xl font-semibold">{messages.NotFound.title}</h1>
          <p className="text-text-muted mt-2">{messages.NotFound.description}</p>
          {/* Plain next/link, not the locale-aware one from @/i18n/navigation:
              this page renders above the locale layout, outside the intl
              provider, so there is no locale to prefix with. */}
          <Link href="/" className="text-brand-text-strong mt-6 inline-block underline">
            {messages.NotFound.backHome}
          </Link>
        </main>
      </body>
    </html>
  );
}
