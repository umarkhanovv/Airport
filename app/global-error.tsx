'use client';

import './globals.css';

/**
 * The last resort: the root layout itself threw.
 *
 * `app/[locale]/error.tsx` handles everything that fails inside a page, but it
 * mounts inside the layout — so when the layout is what broke, nothing catches
 * it and Next falls back to its own screen. This replaces the whole document,
 * which is why it renders its own `<html>` and `<body>`.
 *
 * Trilingual as literal text, the same way `app/offline/page.tsx` is: there is
 * no `NextIntlClientProvider` above this, and nothing here may depend on the
 * thing that just failed. No header, no footer, no links into the site — if the
 * layout cannot render, neither can its navigation. Reloading is the only
 * offer, because it is the only one that can be honoured.
 */

const MESSAGES = [
  {
    lang: 'ru',
    title: 'Страница не открылась',
    body: 'Произошла ошибка на стороне сайта. Попробуйте обновить страницу.',
    retry: 'Обновить',
  },
  {
    lang: 'en',
    title: 'The page could not be opened',
    body: 'Something went wrong on our side. Try reloading the page.',
    retry: 'Reload',
  },
  {
    lang: 'kk',
    title: 'Бет ашылмады',
    body: 'Сайт жағында қате орын алды. Бетті жаңартып көріңіз.',
    retry: 'Жаңарту',
  },
];

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body className="bg-surface text-text flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-12">
          {MESSAGES.map((message, index) => (
            <section key={message.lang} lang={message.lang}>
              <h1 className="text-xl font-semibold">{message.title}</h1>
              <p className="text-text-muted mt-2 text-sm">{message.body}</p>
              {/* One button, under the first language, rather than three that
                  do the same thing. */}
              {index === 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="bg-brand text-on-brand focus:ring-focus mt-4 rounded-md px-5 py-2.5 font-medium focus:ring-2 focus:outline-none"
                >
                  {message.retry}
                </button>
              )}
            </section>
          ))}

          {/* The hash Next logs beside the real error, never the error itself. */}
          {error.digest && (
            <p className="text-text-muted tabular text-xs">Reference: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
