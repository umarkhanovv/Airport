'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * The page failed to render.
 *
 * There was no error boundary at all until now, which meant any throw in a
 * server component put Next's own error screen in front of a visitor:
 * unstyled, English only, and with no way back — on a site whose other two
 * languages are the ones most of its readers use.
 *
 * A client component because Next requires it; boundaries have to run in the
 * browser to offer a retry. It renders inside the locale layout, so the header,
 * the footer and `NextIntlClientProvider` are all still above it and the text
 * can be translated normally. When the *layout itself* is what threw, this
 * never mounts and `app/global-error.tsx` takes over.
 *
 * The thrown message is deliberately not shown. It can carry a filesystem path,
 * a query fragment or a row of somebody's data. `digest` is shown instead: it
 * is the hash Next writes beside the real error in the server log, so a caller
 * can quote it to staff and staff can find the entry.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Error');

  return (
    <div className="max-w-md py-10">
      <p className="text-brand-text-strong text-5xl font-semibold">500</p>
      <h1 className="text-text mt-4 text-2xl font-semibold">{t('title')}</h1>
      <p className="text-text-muted mt-2">{t('description')}</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="bg-brand text-on-brand focus:ring-focus rounded-md px-5 py-2.5 font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
        >
          {t('retry')}
        </button>
        <Link href="/" className="text-brand-text-strong underline">
          {t('backHome')}
        </Link>
      </div>

      {error.digest && (
        <p className="text-text-muted tabular mt-8 text-xs">
          {t('reference')}: {error.digest}
        </p>
      )}
    </div>
  );
}
