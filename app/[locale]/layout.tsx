import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { AirportStructuredData } from '@/components/structured-data';
import { ThemeScript } from '@/components/theme-script';
import { env } from '@/lib/env';
import { alternatesFor } from '@/lib/seo';
import { routing, type Locale } from '@/i18n/routing';

import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Browser chrome colour, per scheme.
 *
 * The manifest can only carry one `theme_color`, so the dark value is declared
 * here — without it a dark-theme user gets a white bar above a near-black page.
 * Both values are the `--surface` token for their scheme.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1219' },
  ],
};

export async function generateMetadata(
  props: Omit<LayoutProps<'/[locale]'>, 'children'>
): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Site' });

  return {
    // Set once here so every page's relative `alternates` and Open Graph URLs
    // resolve against the real origin rather than localhost.
    metadataBase: new URL(env.siteUrl),
    title: {
      default: t('name'),
      template: `%s — ${t('shortName')}`,
    },
    description: t('description'),
    alternates: alternatesFor(locale as Locale, '/'),
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    // iOS reads these rather than the manifest when adding to the home screen.
    appleWebApp: { capable: true, title: t('shortName'), statusBarStyle: 'default' },
    openGraph: {
      type: 'website',
      siteName: t('name'),
      locale,
      title: t('name'),
      description: t('description'),
      url: alternatesFor(locale as Locale, '/').canonical,
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for every Server Component below this point.
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'Nav' });

  return (
    // `locale` is a BCP-47 code (ru | en | kk) by construction — see i18n/routing.ts.
    // The Kazakh URL prefix is /kz, but the language attribute is correctly `kk`.
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Must run before first paint or a dark-theme user gets a white
            flash on every navigation. */}
        <ThemeScript />
        <AirportStructuredData locale={locale} />
      </head>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="bg-surface text-brand-text-strong border-border focus:ring-focus sr-only rounded-sm border px-4 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
          >
            {t('skipToContent')}
          </a>
          <SiteHeader />
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
          <SiteFooter />
          <ServiceWorkerRegistration />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
