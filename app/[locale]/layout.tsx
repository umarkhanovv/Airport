import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ThemeScript } from '@/components/theme-script';
import { routing } from '@/i18n/routing';

import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: Omit<LayoutProps<'/[locale]'>, 'children'>
): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Site' });

  return {
    title: {
      default: t('name'),
      template: `%s — ${t('shortName')}`,
    },
    description: t('description'),
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
