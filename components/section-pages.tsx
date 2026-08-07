import { getTranslations } from 'next-intl/server';

import { listPagesInSection } from '@/lib/content';
import { Link } from '@/i18n/navigation';
import type { Section } from '@/lib/constants';

/**
 * The list of pages belonging to one IA section.
 *
 * Shared, because one section never reaches `app/[locale]/[section]`: `/flights`
 * is the flight board and has its own route, which shadows the section index
 * entirely. Without this, four pages — the airlines list, cargo tariffs, the
 * seasonal schedule and the ticket offices — are reachable only by typing their
 * address.
 */
export async function SectionPages({
  locale,
  section,
  className,
  /**
   * `'list'` is one column of links with their descriptions: reference pages,
   * scanned for a single title, which a plain list is faster at than anything
   * decorated.
   *
   * `'inline'` is a single line of links and nothing else. It exists for the
   * flight board, which sits at 19.9 KB of the 20 KB critical render path in
   * plan §9.2 before this list is added at all — and the board's whole reason
   * for being server-rendered is that it arrives fast on a bad connection. The
   * four titles there say plainly enough what they are without descriptions,
   * borders or a heading.
   */
  layout = 'list',
}: {
  locale: string;
  section: Section;
  className?: string;
  layout?: 'list' | 'inline';
}) {
  const pages = listPagesInSection(locale, section);
  if (pages.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'Content' });
  const headingId = `section-pages-${section}`;

  if (layout === 'inline') {
    return (
      <nav className={className} aria-label={t('inThisSection')}>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {pages.map((page) => (
            <li key={page.slug.join('/')}>
              <Link
                href={`/${page.slug.join('/')}`}
                className="text-brand-text-strong focus-visible:ring-focus rounded-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                {page.frontmatter.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav className={className} aria-labelledby={headingId}>
      <h2 id={headingId} className="text-text text-sm font-semibold">
        {t('inThisSection')}
      </h2>

      <ul className="border-border divide-border mt-3 max-w-2xl divide-y rounded-lg border">
        {pages.map((page) => (
          <li key={page.slug.join('/')}>
            <Link
              href={`/${page.slug.join('/')}`}
              className="hover:bg-surface-sunken focus-visible:ring-focus block px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-text font-medium">
                {page.frontmatter.title}
                {/*
                  Marked, not hidden. Someone looking for the police desk is
                  better served by "that page is here and its text is coming"
                  than by a section that appears not to cover it at all.
                */}
                {page.frontmatter.needsContent && (
                  <span className="text-text-muted ms-2 text-xs font-normal">
                    · {t('pageAwaitingContent')}
                  </span>
                )}
              </span>
              {page.frontmatter.description && (
                <span className="text-text-muted mt-0.5 block text-sm">
                  {page.frontmatter.description}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
