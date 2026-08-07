/**
 * Stage 8, steps 3, 4 and 6 — generate content, gaps and redirects (plan §8).
 *
 *   npm run migrate:generate
 *   npm run migrate:generate -- --dry-run
 *
 * Reads the reviewed mapping and writes:
 *
 *   content/{ru,en,kk}/…        MDX pages
 *   public/media/legacy/…       images pulled off the legacy site
 *   migration/translation-gaps.md   step 4 handover checklist
 *   migration/redirects.json    step 6, consumed by next.config.ts
 *
 * The HTML→MDX conversion is deliberately conservative. The corpus is short
 * prose — median 46 words — with almost no structure beyond paragraphs, lists
 * and the occasional table, so a hand-written converter covering exactly that
 * costs less than a dependency and fails visibly rather than subtly. Anything
 * it cannot represent is recorded in the page's `migrationNotes` frontmatter
 * for the human proofread (step 5) rather than silently dropped.
 *
 * Requires `migration/`, which is not in this repository: it holds the crawled
 * copy of the legacy site and the hand-authored mapping, and the mapping is an
 * assessment of the client's existing site rather than project documentation.
 * Run `npm run migrate:crawl` first, then supply a mapping.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { slugify } from '../../lib/slug.ts';

import { contentRegion, decodeEntities, stripPostListing } from './html.mts';
import { loadMapping } from './load-mapping.mts';
import type { Decision } from './mapping-types.mts';

const { ALIASES, MAPPING } = await loadMapping();

const ROOT = process.cwd();
const MIGRATION_DIR = path.join(ROOT, 'migration');
const CACHE_DIR = path.join(MIGRATION_DIR, '.cache');
const CONTENT_DIR = path.join(ROOT, 'content');

const dryRun = process.argv.includes('--dry-run');

/** The site's locale codes. The legacy URL prefix `kz` is the locale `kk`. */
const LOCALE_OF_PREFIX = { ru: 'ru', en: 'en', kz: 'kk' } as const;

interface InventoryRecord {
  url: string;
  slug: string;
  locale: 'ru' | 'en' | 'kz';
  type: string;
  status: number;
  title: string;
  heading: string;
  description: string;
  words: number;
  images: string[];
  iframes: string[];
  files: string[];
}

const inventory: InventoryRecord[] = JSON.parse(
  fs.readFileSync(path.join(MIGRATION_DIR, 'inventory.json'), 'utf8')
);

function cachedHtml(url: string): string | null {
  const file = path.join(CACHE_DIR, `${crypto.createHash('sha1').update(url).digest('hex')}.html`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split('\n').slice(1).join('\n');
}

// ---------------------------------------------------------------------------
// HTML → MDX
// ---------------------------------------------------------------------------

/** Characters that would otherwise be read as MDX/JSX rather than as text. */
function escapeMdx(text: string): string {
  return text
    .replace(/([<>{}])/g, '\\$1')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves a legacy `href` against the page it was written on.
 *
 * The legacy site links some of its own files with a root-relative path —
 * `/wp-content/uploads/2021/01/LOT01.pdf`. Carried across verbatim those
 * resolve against the *new* domain, where nothing of the sort exists, so four
 * tender documents arrived as links that were broken on the day they were
 * written rather than on the day the old site is switched off.
 *
 * Anything already absolute, and anything that is not a path at all — `mailto:`,
 * `tel:`, a fragment — is left exactly as it was.
 */
function resolveHref(href: string, sourceUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return href;

  try {
    return new URL(href, sourceUrl).toString();
  } catch {
    return href;
  }
}

function inlineToMdx(html: string, sourceUrl: string): string {
  return (
    escapeMdx(
      decodeEntities(
        html
          .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner) => `**${inner}**`)
          .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner) => `_${inner}_`)
          .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
            const label = inner.replace(/<[^>]+>/g, '').trim();
            return label ? `[${label}](${resolveHref(href, sourceUrl)})` : '';
          })
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '')
      )
    )
      // The escaper runs before link syntax would be damaged, so restore the two
      // characters that only ever appear inside links we just built.
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
  );
}

interface ConversionResult {
  mdx: string;
  images: string[];
  /** Things the converter refused to guess at, surfaced for the proofread. */
  warnings: string[];
}

/**
 * Converts one content region to MDX.
 *
 * Block-level elements are handled by walking the region in document order and
 * emitting the ones that carry meaning. Everything else collapses to its text.
 *
 * Text between those elements is emitted too. The page builder has a "raw HTML"
 * block whose contents authors typed by hand, and on this site they typed bare
 * text and a bare `<a>` into a `<div>` with no paragraph around either. Matching
 * only on block tags skipped it, which is how the Kazakh vacancies page — whose
 * whole body is one such block — came to be filed as a page the airport still
 * had to write.
 */
function htmlToMdx(region: string, sourceUrl: string, dropHeading = ''): ConversionResult {
  const warnings: string[] = [];
  const images: string[] = [];
  const blocks: string[] = [];

  // The template renders the frontmatter title as the page's h1, so the
  // legacy page's own opening heading would appear twice.
  const normalise = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  let headingToDrop = normalise(dropHeading);

  const listing = stripPostListing(region);
  if (listing.posts > 0) {
    warnings.push(
      `${listing.posts} news post(s) were listed on the legacy page and are not repeated here; ` +
        `news is served from the database`
    );
  }

  const cleaned = listing.region
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const blockPattern =
    /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<(p)\b[^>]*>([\s\S]*?)<\/\3>|<(ul|ol)\b[^>]*>([\s\S]*?)<\/\5>|<(table)\b[^>]*>([\s\S]*?)<\/\7>|<img\b([^>]*)>|<(iframe)\b([^>]*)>/gi;

  /**
   * Emits whatever text sits between the blocks, as its own paragraph.
   *
   * Most gaps are nothing but the theme's nested container divs, so the test
   * is for letters rather than for characters: a slideshow's "1 / 6" counters
   * and its ❮ ❯ arrows are drawn by its script and are not content.
   */
  let cursor = 0;
  const flushOrphanText = (upTo: number) => {
    const gap = cleaned.slice(cursor, upTo);
    cursor = upTo;

    const text = inlineToMdx(gap, sourceUrl);
    if (/\p{L}/u.test(text)) blocks.push(text);
  };

  for (const match of cleaned.matchAll(blockPattern)) {
    flushOrphanText(match.index);
    cursor = match.index + match[0].length;

    const [
      ,
      hTag,
      hInner,
      pTag,
      pInner,
      listTag,
      listInner,
      tableTag,
      tableInner,
      imgAttrs,
      iframeTag,
      iframeAttrs,
    ] = match;

    if (hTag) {
      const text = inlineToMdx(hInner!, sourceUrl);
      if (!text) continue;

      if (headingToDrop && normalise(text) === headingToDrop) {
        headingToDrop = '';
        continue;
      }

      // Heading levels are shifted down one: the page template renders the
      // frontmatter title as the h1, so a migrated h1 would be a second one.
      const level = Math.min(6, Number(hTag[1]) + 1);
      blocks.push(`${'#'.repeat(level)} ${text}`);
      continue;
    }

    if (pTag) {
      const text = inlineToMdx(pInner!, sourceUrl);
      if (text) blocks.push(text);
      continue;
    }

    if (listTag) {
      const marker = listTag.toLowerCase() === 'ol' ? '1.' : '-';
      const items = [...listInner!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((li) => inlineToMdx(li[1]!, sourceUrl))
        .filter(Boolean);
      if (items.length > 0) blocks.push(items.map((item) => `${marker} ${item}`).join('\n'));
      continue;
    }

    if (tableTag) {
      const rows = [...tableInner!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
        [...tr[1]!.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) =>
          inlineToMdx(cell[2]!, sourceUrl)
        )
      );
      const width = Math.max(0, ...rows.map((r) => r.length));
      if (width > 0 && rows.length > 0) {
        const pad = (row: string[]) => [...row, ...Array(width - row.length).fill('')];
        const [header, ...body] = rows;
        blocks.push(
          [
            `| ${pad(header!).join(' | ')} |`,
            `| ${Array(width).fill('---').join(' | ')} |`,
            ...body.map((row) => `| ${pad(row).join(' | ')} |`),
          ].join('\n')
        );
      }
      continue;
    }

    if (imgAttrs !== undefined) {
      const src = /\bsrc=["']([^"']+)["']/i.exec(imgAttrs)?.[1];
      const alt = /\balt=["']([^"']*)["']/i.exec(imgAttrs)?.[1] ?? '';
      if (src && !src.startsWith('data:')) {
        const absolute = new URL(src, sourceUrl).toString();
        images.push(absolute);
        blocks.push(`![${escapeMdx(decodeEntities(alt))}](${localImagePath(absolute)})`);
        if (!alt.trim()) warnings.push(`image has no alt text: ${absolute}`);
      }
      continue;
    }

    if (iframeTag) {
      // Never carried across. The only embed on the legacy site is a Google
      // Maps iframe, replaced by the location-map facade (plan §6.6), and a
      // third-party frame would breach the no-blocking-third-parties budget.
      const src = /\bsrc=["']([^"']+)["']/i.exec(iframeAttrs ?? '')?.[1] ?? 'unknown';
      warnings.push(`dropped an embed, needs a decision: ${src}`);
    }
  }

  flushOrphanText(cleaned.length);

  return { mdx: blocks.join('\n\n'), images, warnings };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function localImagePath(url: string): string {
  const extension = (path.extname(new URL(url).pathname) || '.jpg').toLowerCase();
  const name = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  return `/media/legacy/${name}${extension}`;
}

/**
 * Cache of the *outcome* of each download, not of the attempt.
 *
 * The same image appears on the Russian, English and Kazakh copies of a page.
 * Memoising "already tried" and returning true would tell the second and third
 * callers the file exists when the first fetch had in fact failed, leaving a
 * reference to a file that was never written — a broken image on the live site.
 */
const attempted = new Map<string, boolean>();

async function downloadImage(url: string): Promise<boolean> {
  const target = path.join(ROOT, 'public', localImagePath(url).replace(/^\//, ''));
  if (fs.existsSync(target)) return true;

  const previous = attempted.get(url);
  if (previous !== undefined) return previous;

  let ok = false;
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'hsairport-migration/1.0' } });
    if (response.ok) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      ok = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch {
    ok = false;
  }

  attempted.set(url, ok);
  return ok;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * Documents linked from a page — 207 of them across the site, 188 on the
 * announcements page alone.
 *
 * They are the one class of legacy asset that a reader loses entirely when
 * hsairport.kz is switched off: an image that fails to load leaves a page that
 * still reads, but a procurement notice is the whole point of the line that
 * links to it. So they are copied into this repository rather than left
 * pointing at a host that is going away.
 */
const DOCUMENT_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|zip)$/i;

function documentLinksIn(mdx: string): string[] {
  return [
    ...new Set(
      [...mdx.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)]
        .map((match) => match[1]!)
        .filter((url) => DOCUMENT_EXTENSIONS.test(new URL(url).pathname))
    ),
  ];
}

/** Assigned names, so two different documents never claim the same path. */
const documentPaths = new Map<string, string>();
const takenDocumentPaths = new Map<string, string>();

/**
 * Where one attachment is re-hosted.
 *
 * Unlike images, which nobody sees the filename of, a document's name is what
 * appears in the reader's downloads folder — so it is transliterated rather
 * than hashed, under the rule `lib/slug.ts` sets out for news slugs: the legacy
 * site's percent-encoded Cyrillic is unreadable and breaks when copied into
 * plain text.
 *
 * The upload month from the legacy path leads the name. It disambiguates the
 * eleven separate files called `приказ.docx` while remaining something a person
 * can read, which a hash would not be.
 */
function localDocumentPath(url: string): string {
  const existing = documentPaths.get(url);
  if (existing) return existing;

  const decoded = decodeURIComponent(new URL(url).pathname);
  const extension = (path.extname(decoded) || '.pdf').toLowerCase();
  const stem = slugify(path.basename(decoded, path.extname(decoded))) || 'document';
  const month = /\/(\d{4})\/(\d{2})\//.exec(decoded);

  let candidate = `/documents/legacy/${month ? `${month[1]}-${month[2]}-` : ''}${stem}${extension}`;

  // Same month, same name, different file: two of the tender protocols do this.
  const owner = takenDocumentPaths.get(candidate);
  if (owner && owner !== url) {
    const suffix = crypto.createHash('sha1').update(url).digest('hex').slice(0, 6);
    candidate = candidate.replace(extension, `-${suffix}${extension}`);
  }

  takenDocumentPaths.set(candidate, url);
  documentPaths.set(url, candidate);
  return candidate;
}

async function downloadDocument(url: string): Promise<boolean> {
  const target = path.join(ROOT, 'public', localDocumentPath(url).replace(/^\//, ''));
  if (fs.existsSync(target)) return true;

  const previous = attempted.get(url);
  if (previous !== undefined) return previous;

  let ok = false;

  // Retried, unlike images. These are large files over a single connection to a
  // shared-hosting WordPress site, and a first sweep lost 38 of 207 to resets
  // that a second attempt recovered.
  for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'hsairport-migration/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
        ok = true;
      } else if (response.status === 404) {
        break;
      }
    } catch {
      ok = false;
    }

    await new Promise((resolve) => setTimeout(resolve, ok ? 100 : 1000));
  }

  attempted.set(url, ok);
  return ok;
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface PageInputs {
  title: string;
  description: string;
  section: string;
  legacyUrl: string;
  translationStatus: 'complete' | 'machine' | 'pending';
  body: string;
  warnings: string[];
  /** The legacy page had no body text; the airport has to supply it. */
  needsContent: boolean;
}

function renderPage(page: PageInputs): string {
  const frontmatter = [
    '---',
    `title: ${yamlString(page.title)}`,
    page.description ? `description: ${yamlString(page.description)}` : null,
    `section: ${page.section}`,
    `legacyUrl: ${yamlString(page.legacyUrl)}`,
    `translationStatus: ${page.translationStatus}`,
    // Deliberately blank: no human has reviewed this yet. Step 5 fills it in,
    // and an empty value is the honest signal that the page is unproofed.
    'lastReviewed:',
    page.needsContent ? 'needsContent: true' : null,
    // Migration notes live in the frontmatter, not in an MDX comment in the
    // body. A `{/* … */}` block does not survive Prettier's MDX formatter: it
    // escapes the asterisks, and the file stops compiling. YAML is inert, the
    // content loader ignores keys it does not know, and anyone opening the file
    // to proofread it sees the notes before the prose.
    ...(page.warnings.length > 0
      ? ['migrationNotes:', ...page.warnings.map((warning) => `  - ${yamlString(warning)}`)]
      : []),
    '---',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return `${frontmatter}\n\n${page.body}\n`;
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

/**
 * Normalises a legacy path into something `redirects()` will actually match.
 *
 * Every WordPress URL ends in a slash, but Next strips the trailing slash
 * before consulting the redirect table (`trailingSlash` is false), so a rule
 * keyed on `/incoming-flights/` is never consulted and the visitor gets a 404.
 * Matching the normalised form covers both, since the slashed URL is rewritten
 * to it first.
 */
function redirectSource(pathname: string): string {
  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
}

/**
 * Normalises a destination the same way, preserving any query string.
 *
 * Without this the locale home pages produce `/en` → `/en/`, which Next
 * rewrites straight back to `/en` and follows again: ERR_TOO_MANY_REDIRECTS on
 * the English and Kazakh home pages. The self-redirect guard below only catches
 * it once both sides are in the same form.
 */
function redirectDestination(destination: string): string {
  const [pathname, query] = destination.split(/(?=\?)/);
  return `${redirectSource(pathname ?? '/')}${query ?? ''}`;
}

function recordFor(slug: string, prefix: 'ru' | 'en' | 'kz'): InventoryRecord | undefined {
  return inventory.find((r) => r.slug === slug && r.locale === prefix && r.type === 'page');
}

async function main(): Promise<void> {
  const written: string[] = [];
  const gaps: Array<{ path: string; title: string; missing: string[] }> = [];
  const redirects: Array<{ source: string; destination: string; permanent: boolean }> = [];
  const allWarnings: Array<{ page: string; warning: string }> = [];
  let imagesFetched = 0;
  let documentsFetched = 0;

  for (const [slug, decision] of Object.entries(MAPPING) as Array<[string, Decision]>) {
    // Redirects for every legacy URL, in all three locales, whatever the action.
    const destinationFor = (d: Decision): string | null => {
      if (d.action === 'migrate') return d.path;
      if (d.action === 'replace') return d.by;
      if (d.action === 'merge') {
        const into = MAPPING[d.into];
        return into?.action === 'migrate' ? into.path : null;
      }
      return null;
    };

    const destination = destinationFor(decision);

    const aliasesForSlug = Object.entries(ALIASES)
      .filter(([, alias]) => alias.into === slug)
      .map(([aliasSlug]) => aliasSlug);

    for (const prefix of ['ru', 'en', 'kz'] as const) {
      for (const candidate of [slug, ...aliasesForSlug]) {
        const record = recordFor(candidate, prefix);
        if (!record) continue;

        const legacyPath = redirectSource(new URL(record.url).pathname);
        const localePrefix = prefix === 'ru' ? '' : `/${prefix}`;
        // Dropped pages send readers to the section they would have belonged to,
        // or the home page — never to a 404 they cannot act on.
        const target =
          destination ??
          (decision.action === 'drop' && 'section' in decision ? `/${decision.section}` : '/');

        redirects.push({
          source: legacyPath,
          destination: redirectDestination(`${localePrefix}${target}`),
          permanent: true,
        });
      }
    }

    if (decision.action !== 'migrate') continue;

    const present: string[] = [];
    for (const prefix of ['ru', 'en', 'kz'] as const) {
      // Some pages exist only in EN/KZ under a different slug, and occasionally
      // carry far more text than the Russian original. Pick the fuller source.
      const aliasSlugs = Object.entries(ALIASES)
        .filter(([, alias]) => alias.into === slug)
        .map(([aliasSlug]) => aliasSlug);

      const candidates = [slug, ...aliasSlugs]
        .map((candidate) => recordFor(candidate, prefix))
        .filter((r): r is InventoryRecord => r !== undefined)
        .sort((a, b) => b.words - a.words);

      const record = candidates[0];
      if (!record) continue;

      const html = cachedHtml(record.url);
      if (!html) continue;

      const converted = htmlToMdx(contentRegion(html), record.url, record.heading);
      if (record.slug !== slug) {
        converted.warnings.push(
          `content taken from ${record.url} — ${ALIASES[record.slug]?.note ?? 'locale-only page'}`
        );
      }
      const images = [...converted.images];
      const warnings = [...converted.warnings];
      const sections = [converted.mdx];

      // Fold in every page merged into this one, as its own section. Without
      // this the losing half of each duplicate pair is silently discarded —
      // and some of them, like the city WiFi page, are genuinely different
      // content rather than an abandoned stub.
      for (const [mergedSlug, mergedDecision] of Object.entries(MAPPING)) {
        if (mergedDecision.action !== 'merge' || mergedDecision.into !== slug) continue;

        const mergedRecord = recordFor(mergedSlug, prefix);
        const mergedHtml = mergedRecord ? cachedHtml(mergedRecord.url) : null;
        if (!mergedRecord || !mergedHtml) continue;

        const mergedConverted = htmlToMdx(
          contentRegion(mergedHtml),
          mergedRecord.url,
          mergedRecord.heading
        );
        images.push(...mergedConverted.images);
        warnings.push(
          ...mergedConverted.warnings,
          `merged from ${mergedRecord.url} — ${mergedDecision.note}`
        );

        if (mergedConverted.mdx.trim() !== '') {
          const label = mergedRecord.heading || mergedSlug;
          sections.push(`## ${escapeMdx(label)}`, mergedConverted.mdx);
        }
      }

      let mdx = sections.filter((section) => section.trim() !== '').join('\n\n');

      // Some legacy pages hotlink images from other domains, and those fetches
      // fail. Leaving the reference behind would publish a broken image on the
      // airport's site, so a failed download drops the reference and records
      // the original URL for someone to source the picture from.
      for (const image of images) {
        if (dryRun) continue;

        if (await downloadImage(image)) {
          imagesFetched += 1;
        } else {
          // Removed as markdown, not by line: several of these sit inline in a
          // paragraph alongside text that must survive.
          const local = localImagePath(image).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          mdx = mdx
            .replace(new RegExp(`!\\[[^\\]]*\\]\\(${local}\\)`, 'g'), '')
            .replace(/[^\S\n]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n');
          warnings.push(`image could not be downloaded and was removed: ${image}`);
        }
      }

      // Attachments are re-hosted rather than dropped: unlike an image, the
      // document *is* the content of the line that links to it. One that cannot
      // be fetched keeps its legacy URL — a link that works until the old site
      // goes is better than one that never worked — and says so in the notes.
      for (const document of documentLinksIn(mdx)) {
        if (dryRun) continue;

        if (await downloadDocument(document)) {
          documentsFetched += 1;
          mdx = mdx.replaceAll(`](${document})`, `](${localDocumentPath(document)})`);
        } else {
          warnings.push(
            `attachment could not be downloaded and still points at the legacy site: ${document}`
          );
        }
      }

      const locale = LOCALE_OF_PREFIX[prefix];
      present.push(locale);

      const needsContent = mdx.trim() === '';

      const file = path.join(CONTENT_DIR, locale, `${decision.path.replace(/^\//, '')}.mdx`);
      const contents = renderPage({
        title: record.heading || record.title || decision.path,
        description: record.description,
        section: decision.section,
        legacyUrl: record.url,
        // Nothing here has been read by a person yet, and the legacy site's own
        // translations are of unknown provenance.
        translationStatus: 'pending',
        body: needsContent ? '' : mdx,
        needsContent,
        warnings: [
          ...(needsContent
            ? [
                // The count includes the page's own heading, which the template
                // renders from the title rather than from the body. Saying
                // "1 words" without that caveat reads as though one word of
                // content survived, and the airport asks which word it was.
                `the legacy page carried no body text — its content region held ${record.words} word(s), its own heading included; the airport has to supply it`,
              ]
            : []),
          ...warnings,
          // `proofread`, never `note`. The note is the rationale behind the
          // mapping decision and belongs in the reconciliation table, which is
          // not published; only a neutral, actionable instruction ships inside
          // the content tree.
          ...(decision.proofread ? [decision.proofread] : []),
        ],
      });

      for (const warning of warnings)
        allWarnings.push({ page: `${locale}${decision.path}`, warning });

      if (!dryRun) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, contents, 'utf8');
      }
      written.push(path.relative(ROOT, file));
    }

    const missing = ['ru', 'en', 'kk'].filter((l) => !present.includes(l));
    if (missing.length > 0) {
      const record = recordFor(slug, 'ru');
      gaps.push({
        path: decision.path,
        title: record?.heading ?? slug,
        missing,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Step 4 — translation gaps
  // -------------------------------------------------------------------------
  const gapsDoc = `# Translation gap checklist (Stage 8, step 4)

Generated by \`npm run migrate:generate\`.

Every migrated page below is missing at least one language. The page still
renders — the content loader falls back to Russian and the template shows a
notice — but each row is a translation someone has to write.

| Page | Title | Missing |
| --- | --- | --- |
${gaps.map((g) => `| \`${g.path}\` | ${g.title} | ${g.missing.join(', ')} |`).join('\n')}

## Pages needing content, not translation

Every generated page whose legacy body was empty carries an MDX comment saying
so, with needsContent: true in its frontmatter. Search the content tree for \`needsContent\` to list them.

## Migration warnings

${
  allWarnings.length === 0
    ? 'None.'
    : `| Page | Warning |\n| --- | --- |\n${allWarnings
        .map((w) => `| \`${w.page}\` | ${w.warning} |`)
        .join('\n')}`
}
`;

  // -------------------------------------------------------------------------
  // Step 6 — redirects
  // -------------------------------------------------------------------------

  // News posts are not in the mapping: they were migrated into the database in
  // Stage 5, which recorded each one's legacy URL. Reading the slugs back is
  // the only way to be sure a redirect matches the slug actually published —
  // recomputing them here would drift the moment the seeder's de-duplication
  // resolved a collision differently.
  const databaseFile = path.join(ROOT, 'data', 'app.db');
  if (fs.existsSync(databaseFile)) {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(databaseFile, { readonly: true });
    const posts = db
      .prepare(
        'select locale, slug, legacy_url as legacyUrl from news_posts where legacy_url is not null'
      )
      .all() as Array<{ locale: string; slug: string; legacyUrl: string }>;
    db.close();

    for (const post of posts) {
      const prefix = post.locale === 'ru' ? '' : `/${post.locale === 'kk' ? 'kz' : post.locale}`;
      redirects.push({
        source: redirectSource(new URL(post.legacyUrl).pathname),
        destination: redirectDestination(`${prefix}/news/${post.slug}`),
        permanent: true,
      });
    }
    console.log(`  ${posts.length} news post redirects read from the database`);
  } else {
    console.warn('  ! data/app.db not found — news post redirects were not generated.');
    console.warn('    Run npm run news:seed first, then re-run this script.');
  }

  // Category archives have no equivalent; the news index is the honest target.
  for (const record of inventory.filter((r) => r.type === 'category')) {
    const prefix = record.locale === 'ru' ? '' : `/${record.locale}`;
    redirects.push({
      source: redirectSource(new URL(record.url).pathname),
      destination: redirectDestination(`${prefix}/news`),
      permanent: true,
    });
  }

  // De-duplicate, keeping the first decision for any source.
  const seen = new Set<string>();
  const uniqueRedirects = redirects.filter((r) => {
    if (seen.has(r.source) || r.source === r.destination) return false;
    seen.add(r.source);
    return true;
  });
  redirects.length = 0;
  redirects.push(...uniqueRedirects);

  redirects.sort((a, b) => a.source.localeCompare(b.source));

  // Compared in normalised form, or every WordPress URL looks uncovered. The
  // home pages are excluded: they already resolve, and a `/` → `/` rule would
  // be a loop rather than a redirect.
  const covered = new Set(redirects.map((r) => r.source));
  const uncovered = inventory
    .filter((r) => r.status === 200)
    .map((r) => redirectSource(new URL(r.url).pathname))
    .filter((pathname) => !covered.has(pathname) && !/^(\/|\/en|\/kz)$/.test(pathname));

  if (uncovered.length > 0) {
    console.warn(`  ! ${uncovered.length} legacy URLs have no redirect:`);
    for (const url of uncovered.slice(0, 10)) console.warn(`      ${url}`);
  } else {
    console.log('  every legacy URL that returns 200 has a redirect');
  }

  if (!dryRun) {
    fs.writeFileSync(path.join(MIGRATION_DIR, 'translation-gaps.md'), gapsDoc, 'utf8');
    fs.writeFileSync(
      path.join(ROOT, 'lib', 'legacy-redirects.json'),
      `${JSON.stringify(redirects, null, 2)}\n`,
      'utf8'
    );
  }

  console.log(`\n${dryRun ? 'Dry run — nothing written.\n' : ''}`);
  console.log(`  ${written.length} MDX pages`);
  console.log(`  ${imagesFetched} images downloaded`);
  console.log(`  ${documentsFetched} attachments re-hosted`);
  console.log(`  ${redirects.length} redirects`);
  console.log(`  ${gaps.length} pages missing a translation`);
  console.log(`  ${allWarnings.length} migration warnings for proofreading\n`);
}

await main();
