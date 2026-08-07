/**
 * Stage 8 — check the migrated pages against the live legacy site.
 *
 *   npm run migrate:verify
 *   npm run migrate:verify -- --cached      # read the crawl cache, no network
 *
 * Answers one question for every page in `content/`: is anything the legacy
 * page shows a reader missing from the page that replaced it?
 *
 * It exists because two claims made about the migration are strong ones to make
 * about someone else's website, and neither should be taken on trust:
 *
 *   1. that 53 pages are empty — that the airport never wrote them, rather than
 *      that the converter failed to read a page-builder layout;
 *   2. that the other 92 came across whole.
 *
 * Both are checkable. Each page is fetched again — from the live site by
 * default, so the answer is about the site as it stands rather than as it was
 * crawled — and its visible text is compared line by line against the MDX that
 * replaced it. Anything present there and absent here is reported, and the run
 * exits non-zero, so this doubles as the check to re-run once the airport
 * starts filling the empty pages in.
 *
 * The comparison ignores punctuation, case and markup entirely: the converter
 * rewrites links, escapes MDX characters and re-wraps lines, so only the
 * letters and digits are meaningful. Lines with no letters at all are skipped —
 * a slideshow's "1 / 6" counters and its ❮ ❯ arrows are drawn by its script and
 * are not content anybody wrote.
 *
 * Output: migration/content-check.md, deliberately outside the public
 * repository for the reason the reconciliation table is — it is an assessment
 * of the client's existing site.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { attributesOf, contentRegion, stripNoise, stripPostListing, textOf } from './html.mts';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'migration');
const CACHE_DIR = path.join(OUT_DIR, '.cache');
const REPORT = path.join(OUT_DIR, 'content-check.md');

const cached = process.argv.includes('--cached');

/** Courtesy delay between requests. This is a live site serving real people. */
const DELAY_MS = 150;
const USER_AGENT = 'hsairport-migration/1.0 (+content migration for the airport own site rebuild)';

/** Below this many letters a line is a fragment, and containment proves little. */
const MIN_LINE_LETTERS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Page {
  /** Repository-relative path of the MDX page. */
  file: string;
  locale: string;
  title: string;
  legacyUrl: string;
  needsContent: boolean;
  /** The MDX body, frontmatter removed. */
  body: string;
  migrationNotes: string[];
}

interface Result {
  page: Page;
  status: number | 'cache' | 'error';
  /** Legacy body text, the page's own heading removed. */
  legacyText: string;
  legacyWords: number;
  /** Legacy lines with no counterpart in the migrated page. */
  missing: string[];
  images: string[];
  files: string[];
  iframes: string[];
  tables: number;
}

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.mdx') ? [full] : [];
  });
}

function collectPages(): Page[] {
  return walk(CONTENT_DIR)
    .map((file) => {
      const { data, content } = matter(fs.readFileSync(file, 'utf8'));
      const relative = path.relative(ROOT, file);
      return {
        file: relative,
        locale: relative.split(path.sep)[1] ?? '',
        title: typeof data.title === 'string' ? data.title : '',
        legacyUrl: typeof data.legacyUrl === 'string' ? data.legacyUrl : '',
        needsContent: data.needsContent === true,
        body: content,
        migrationNotes: Array.isArray(data.migrationNotes)
          ? data.migrationNotes.filter((note): note is string => typeof note === 'string')
          : [],
      };
    })
    .filter((page) => page.legacyUrl !== '')
    .sort((a, b) => a.file.localeCompare(b.file));
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function load(url: string): Promise<{ html: string; status: number | 'cache' | 'error' }> {
  if (cached) {
    const file = path.join(
      CACHE_DIR,
      `${crypto.createHash('sha1').update(url).digest('hex')}.html`
    );
    if (!fs.existsSync(file)) return { html: '', status: 'error' };
    return { html: fs.readFileSync(file, 'utf8').split('\n').slice(1).join('\n'), status: 'cache' };
  }

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
    });
    const html = await response.text();
    await sleep(DELAY_MS);
    return { html, status: response.status };
  } catch {
    return { html: '', status: 'error' };
  }
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

/** Letters and digits only — everything the converter is allowed to change. */
const key = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const letters = (value: string) => (value.match(/\p{L}/gu) ?? []).length;

/** Every heading in a region, in document order. */
function headingsOf(region: string): string[] {
  return [...stripNoise(region).matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) =>
      match[2]!
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

/**
 * Reduces MDX to the words a reader sees.
 *
 * A link's target has to go before the comparison, not after: the converter
 * turns `<a href="http://adilet.gov.kz">adilet.gov.kz</a>` into
 * `[adilet.gov.kz](http://adilet.gov.kz)`, which interleaves the URL's letters
 * with the sentence's. Comparing on letters alone then reports the whole
 * paragraph as missing when every word of it is present.
 */
function readableText(mdx: string): string {
  return mdx
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\(.)/g, '$1');
}

function compare(page: Page, html: string, status: Result['status']): Result {
  const region = stripPostListing(contentRegion(html)).region;

  // The page's own heading is chrome, not content: the new template renders it
  // from the frontmatter title. Matching on the title alone is not enough —
  // several legacy pages head an English or Kazakh page with the Russian
  // heading, and the FAQ was rewritten rather than migrated, so its title and
  // the legacy heading are different sentences about the same thing.
  const ownHeadings = new Set(
    [key(page.title), key(headingsOf(region)[0] ?? '')].filter((value) => value !== '')
  );

  const lines = textOf(region)
    .split('\n')
    .filter((line) => !ownHeadings.has(key(line)));

  const migrated = key(readableText(page.body));
  const missing = lines.filter(
    (line) => letters(line) >= MIN_LINE_LETTERS && !migrated.includes(key(line))
  );

  return {
    page,
    status,
    legacyText: lines.join('\n'),
    legacyWords: lines.join(' ').split(/\s+/).filter(Boolean).length,
    missing: [...new Set(missing)],
    images: [...new Set(attributesOf(region, 'img', 'src'))].filter((s) => !s.startsWith('data:')),
    iframes: [...new Set(attributesOf(region, 'iframe', 'src'))],
    files: [...new Set(attributesOf(region, 'a', 'href'))].filter((href) =>
      /\.(pdf|docx?|xlsx?|pptx?|zip)(\?|$)/i.test(href)
    ),
    tables: (stripNoise(region).match(/<table\b/gi) ?? []).length,
  };
}

/** The file name a URL ends in, decoded, so two spellings of it compare equal. */
function basename(url: string): string {
  const raw = url.split(/[?#]/)[0]!.split('/').pop() ?? '';
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Anything a reader would see. A page with only a heading has none of it.
 *
 * An image the generator could not fetch does not count. The advertising page's
 * whole body is a slideshow hotlinked from another airport's domain, and every
 * one of those files now 404s — so the page is not empty in its markup, but it
 * is empty on the screen, and the airport does have to supply the artwork
 * again. Reporting it as content we failed to migrate would be wrong.
 */
function legacyHasContent(result: Result): boolean {
  const missingImages = new Set(
    result.page.migrationNotes
      .filter((note) => note.startsWith('image could not be downloaded'))
      .map((note) => basename(note.slice(note.lastIndexOf(' ') + 1)))
  );
  const liveImages = result.images.filter((src) => !missingImages.has(basename(src)));

  return (
    letters(result.legacyText) > 0 ||
    liveImages.length > 0 ||
    result.files.length > 0 ||
    result.iframes.length > 0
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function render(results: Result[]): string {
  const dropped = results.filter((r) => r.missing.length > 0);
  const wronglyEmpty = results.filter((r) => r.page.needsContent && legacyHasContent(r));
  const unreachable = results.filter((r) => r.status === 'error' || r.status === 404);
  const empty = results.filter((r) => r.page.needsContent);

  const lines = [
    '# Migrated pages, checked against the legacy site',
    '',
    `Generated by \`npm run migrate:verify${cached ? ' -- --cached' : ''}\` on ${new Date()
      .toISOString()
      .slice(0, 10)}.`,
    '',
    `- ${results.length} pages checked`,
    `- **${dropped.length} are missing text the legacy page shows**`,
    `- ${empty.length} are marked \`needsContent\`; **${wronglyEmpty.length} of those are not in fact empty**`,
    `- ${unreachable.length} could not be read`,
    '',
    'Punctuation, case and markup are ignored — only letters and digits are',
    'compared, because the converter rewrites links and escapes MDX characters.',
    "A page's own heading is excluded: the new template renders it from the title,",
    'so a legacy page carrying nothing but its heading is carrying nothing.',
    '',
  ];

  if (dropped.length > 0) {
    lines.push('## Text on the legacy page and not on ours', '');
    for (const result of dropped) {
      lines.push(
        `### \`${result.page.file}\``,
        '',
        `- Legacy URL: ${result.page.legacyUrl}`,
        `- HTTP: ${result.status}`,
        '',
        ...result.missing.map((line) => `- ${line}`),
        ''
      );
    }
  }

  if (wronglyEmpty.length > 0) {
    lines.push(
      '## Marked `needsContent`, but the legacy page holds something',
      '',
      '| Page | Legacy URL | Words | Images | Files | Tables |',
      '| --- | --- | --- | --- | --- | --- |',
      ...wronglyEmpty.map(
        (r) =>
          `| \`${r.page.file}\` | ${r.page.legacyUrl} | ${r.legacyWords} | ${r.images.length} | ${r.files.length} | ${r.tables} |`
      ),
      ''
    );
  }

  lines.push(
    '## Every page marked `needsContent`, in full',
    '',
    'What the legacy page holds below its heading, so the claim that it is empty',
    'can be checked rather than taken on trust.',
    ''
  );

  for (const result of empty) {
    lines.push(
      `### \`${result.page.file}\``,
      '',
      `- Title: ${result.page.title || '—'}`,
      `- Legacy URL: ${result.page.legacyUrl}`,
      `- HTTP: ${result.status}`,
      `- ${result.legacyWords} word(s) below the heading, ${result.images.length} image(s), ` +
        `${result.files.length} attachment(s), ${result.tables} table(s), ${result.iframes.length} embed(s)`,
      ''
    );

    if (letters(result.legacyText) === 0) {
      lines.push('Content region below the heading: _(nothing)_', '');
    } else {
      lines.push('Content region below the heading:', '', '```', result.legacyText, '```', '');
    }

    for (const [label, list] of [
      ['Attachments', result.files],
      ['Images', result.images],
      ['Embeds', result.iframes],
    ] as const) {
      if (list.length > 0) lines.push(`${label}:`, '', ...list.map((v) => `- ${v}`), '');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const pages = collectPages();
  console.log(
    `\nChecking ${pages.length} migrated pages ` +
      `${cached ? 'against the crawl cache' : 'against the live site'}\n`
  );

  const results: Result[] = [];
  for (const page of pages) {
    const { html, status } = await load(page.legacyUrl);
    const result = compare(page, html, status);
    results.push(result);

    const notes = [
      result.missing.length > 0 ? `${result.missing.length} line(s) missing` : '',
      page.needsContent && legacyHasContent(result) ? 'NOT EMPTY' : '',
    ].filter(Boolean);

    if (notes.length > 0)
      console.log(`  ${String(status).padEnd(5)} ${page.file} — ${notes.join(', ')}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REPORT, `${render(results)}\n`, 'utf8');

  const dropped = results.filter((r) => r.missing.length > 0);
  const wronglyEmpty = results.filter((r) => r.page.needsContent && legacyHasContent(r));
  const unreachable = results.filter((r) => r.status === 'error' || r.status === 404);

  console.log(`\nWrote ${path.relative(ROOT, REPORT)}`);
  console.log(`  ${results.length} checked`);
  console.log(`  ${dropped.length} missing text from the legacy page`);
  console.log(`  ${wronglyEmpty.length} marked needsContent that are not empty`);
  if (unreachable.length > 0) console.log(`  ${unreachable.length} could not be read`);

  if (dropped.length > 0 || wronglyEmpty.length > 0) {
    console.log('\nRe-run the migration for those pages, or correct the mapping.\n');
    process.exitCode = 1;
  } else {
    console.log('\nEvery legacy page is fully represented by the page that replaced it.\n');
  }
}

await main();
