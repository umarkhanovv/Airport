import type { Metadata } from 'next';

import { ThemeScript } from '@/components/theme-script';

import '../globals.css';

/**
 * Offline fallback (plan Stage 9, spec §17.4).
 *
 * Only reached when a page was never cached. Anyone who has opened the flight
 * board before gets the board itself from the cache, with the "schedule loaded
 * on …" date it was rendered with — this page is for a first visit that never
 * completed.
 *
 * Trilingual and static: there is no server to ask which language to use, so
 * all three are shown at once rather than guessing. It renders its own document
 * because it sits outside the locale tree, and carries no navigation, since
 * every link on it would fail.
 */

export const metadata: Metadata = {
  title: 'Нет соединения — Аэропорт Туркестан',
  robots: { index: false, follow: false },
};

const MESSAGES = [
  {
    lang: 'ru',
    title: 'Нет подключения к интернету',
    body: 'Эта страница ещё не сохранена для офлайн-просмотра. Откройте табло рейсов, когда появится связь — после этого оно будет доступно и без интернета.',
  },
  {
    lang: 'en',
    title: 'You are offline',
    body: 'This page has not been saved for offline use yet. Open the flight board once you have a connection, and it will be available offline afterwards.',
  },
  {
    lang: 'kk',
    title: 'Интернет байланысы жоқ',
    body: 'Бұл бет офлайн қарау үшін әлі сақталмаған. Байланыс пайда болғанда ұшу кестесін ашыңыз — содан кейін ол интернетсіз де қолжетімді болады.',
  },
];

export default function OfflinePage() {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-surface text-text flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-4 py-12">
          {MESSAGES.map((message) => (
            <section key={message.lang} lang={message.lang}>
              <h1 className="text-xl font-semibold">{message.title}</h1>
              <p className="text-text-muted mt-2 text-sm">{message.body}</p>
            </section>
          ))}
        </main>
      </body>
    </html>
  );
}
