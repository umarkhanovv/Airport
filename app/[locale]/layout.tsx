import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { AirportStructuredData } from '@/components/structured-data';
import { JsMarker } from '@/components/js-marker';
import { env } from '@/lib/env';
import { alternatesFor } from '@/lib/seo';
import { routing, type Locale } from '@/i18n/routing';

import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Browser chrome colour.
 *
 * One value, because there is one theme. This used to be a light/dark pair —
 * the manifest can only carry a single `theme_color`, so the dark surface had
 * to be declared here or a dark-theme reader got a white bar above a near-black
 * page. With the dark palette gone it is simply `--surface`, and it agrees with
 * `app/manifest.ts`.
 */
export const viewport: Viewport = {
  themeColor: '#ffffff',
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
        <JsMarker />
        <AirportStructuredData locale={locale} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/*
          The field every frosted surface on the site is frosting. Fixed rather
          than scrolled, so the tint stays put while the page travels over it —
          which is what makes the blur read as glass rather than as a texture.
        */}
        <div aria-hidden="true" className="app-backdrop" />
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
