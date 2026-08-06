import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { isSection, type Section } from '../constants.ts';

/**
 * Static page content (spec §10).
 *
 * Info pages are MDX files in the repository, one tree per locale. They change
 * rarely, so a CMS would be infrastructure to maintain for no benefit — and
 * the repo/DB boundary in plan §3.2 says only flights, news and feedback are
 * database-backed.
 *
 * Stage 8 generates this tree from the legacy site. Stage 2 only builds the
 * pipeline and template.
 */

export const CONTENT_ROOT = path.join(process.cwd(), 'content');

/** How complete a translation is — surfaced to readers and to Stage 8's report. */
export type TranslationStatus = 'complete' | 'machine' | 'pending';

export interface PageFrontmatter {
  title: string;
  description?: string;
  section?: Section;
  /** Original URL on hsairport.kz, so migrated pages stay traceable. */
  legacyUrl?: string;
  translationStatus?: TranslationStatus;
  /** ISO date a human last checked this page. */
  lastReviewed?: string;
  /** Hides a page from navigation without deleting it. */
  draft?: boolean;
}

export interface ContentPage {
  slug: string[];
  locale: string;
  frontmatter: PageFrontmatter;
  body: string;
  /** True when we fell back to the default locale because no translation exists. */
  isFallback: boolean;
  fallbackLocale?: string;
}

function safeJoin(root: string, segments: string[]): string | null {
  // Reject traversal and absolute segments before touching the filesystem.
  if (segments.some((s) => !s || s.includes('..') || s.includes('/') || s.includes('\\'))) {
    return null;
  }
  const target = path.join(root, ...segments);
  const resolved = path.resolve(target);
  return resolved.startsWith(path.resolve(root)) ? resolved : null;
}

function readFile(locale: string, slug: string[]): { raw: string } | null {
  const base = safeJoin(path.join(CONTENT_ROOT, locale), slug);
  if (!base) return null;

  for (const candidate of [`${base}.mdx`, path.join(base, 'index.mdx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { raw: fs.readFileSync(candidate, 'utf8') };
    }
  }
  return null;
}

/**
 * Loads one page, falling back to the default locale when a translation is
 * missing.
 *
 * Falling back silently would hide the gaps; given the coverage on the legacy
 * site (plan §1.3: ~22 RU pages have no EN, ~20 no KK) that would mean
 * quietly serving Russian to English readers with no signal. So the fallback
 * is recorded on the result and the template shows a notice.
 */
export function getPage(locale: string, slug: string[], fallbackLocale = 'ru'): ContentPage | null {
  const direct = readFile(locale, slug);
  if (direct) {
    const { data, content } = matter(direct.raw);
    return {
      slug,
      locale,
      frontmatter: normalizeFrontmatter(data),
      body: content,
      isFallback: false,
    };
  }

  if (locale !== fallbackLocale) {
    const fallback = readFile(fallbackLocale, slug);
    if (fallback) {
      const { data, content } = matter(fallback.raw);
      return {
        slug,
        locale: fallbackLocale,
        frontmatter: normalizeFrontmatter(data),
        body: content,
        isFallback: true,
        fallbackLocale,
      };
    }
  }

  return null;
}

function normalizeFrontmatter(data: Record<string, unknown>): PageFrontmatter {
  const section =
    typeof data.section === 'string' && isSection(data.section) ? data.section : undefined;
  return {
    title: typeof data.title === 'string' ? data.title : 'Untitled',
    description: typeof data.description === 'string' ? data.description : undefined,
    section,
    legacyUrl: typeof data.legacyUrl === 'string' ? data.legacyUrl : undefined,
    translationStatus:
      data.translationStatus === 'complete' ||
      data.translationStatus === 'machine' ||
      data.translationStatus === 'pending'
        ? data.translationStatus
        : undefined,
    lastReviewed: typeof data.lastReviewed === 'string' ? data.lastReviewed : undefined,
    draft: data.draft === true,
  };
}

/** Every page slug present for a locale — used for static generation. */
export function listSlugs(locale: string): string[][] {
  const root = path.join(CONTENT_ROOT, locale);
  if (!fs.existsSync(root)) return [];

  const out: string[][] = [];
  const walk = (dir: string, prefix: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...prefix, entry.name]);
      } else if (entry.name.endsWith('.mdx')) {
        const name = entry.name.replace(/\.mdx$/, '');
        out.push(name === 'index' ? prefix : [...prefix, name]);
      }
    }
  };
  walk(root, []);
  return out.filter((slug) => slug.length > 0);
}

/** Pages belonging to one IA section, for section index pages. */
export function listPagesInSection(locale: string, section: Section): ContentPage[] {
  return listSlugs(locale)
    .map((slug) => getPage(locale, slug))
    .filter((page): page is ContentPage => page !== null)
    .filter((page) => page.frontmatter.section === section && !page.frontmatter.draft);
}
