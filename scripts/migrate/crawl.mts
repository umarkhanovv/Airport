/**
 * Stage 8, step 1 — inventory the legacy site (plan §8).
 *
 *   npm run migrate:crawl
 *   npm run migrate:crawl -- --refresh     # ignore the cache
 *
 * Crawls the hsairport.kz sitemap, fetches every URL, and writes a structured
 * inventory to `migration/`. Nothing is generated from this yet: step 2
 * reconciles it against the new information architecture, and that table is
 * reviewed before a single MDX file is written.
 *
 * Deliberately dependency-free. Extraction here only has to be good enough to
 * *triage* — word counts, images, embeds, duplicates — and plan §1.3 already
 * established that the hard part of this stage is deciding what survives, not
 * parsing. A real HTML→MDX conversion is step 3's problem.
 *
 * Runs under plain Node with native TypeScript stripping; no build step.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://hsairport.kz';
const SITEMAP = `${ORIGIN}/sitemap.xml`;

const OUT_DIR = path.resolve(process.cwd(), 'migration');
const CACHE_DIR = path.join(OUT_DIR, '.cache');

/** Courtesy delay between requests. This is a live site serving real people. */
const DELAY_MS = 150;

const USER_AGENT =
  'hsairport-migration/1.0 (+content migration for the airport&apos;s own site rebuild)';

const refresh = process.argv.includes('--refresh');

export type Locale = 'ru' | 'en' | 'kz';

export interface InventoryRecord {
  url: string;
  /** Path with the locale prefix removed — the translation-group key. */
  slug: string;
  locale: Locale;
  type: string;
  status: number;
  /** The `<title>` tag. Unreliable — see `heading`. */
  title: string;
  /**
   * The page's own heading, and the field the reconciliation is built from.
   *
   * Recorded separately from `title` and from the slug because on this corpus
   * neither is dependable: a substantial minority of pages carry a `<title>`
   * that contradicts their own heading, and a further set sit under slugs that
   * describe a different subject entirely. The heading was the only field that
   * agreed with the body text on every page spot-checked.
   */
  heading: string;
  description: string;
  /** Words in the content region, before boilerplate subtraction. */
  wordsRaw: number;
  /** Words after lines appearing on ≥70% of pages are removed. */
  words: number;
  images: string[];
  iframes: string[];
  tables: number;
  files: string[];
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cachePath(url: string): string {
  return path.join(CACHE_DIR, `${crypto.createHash('sha1').update(url).digest('hex')}.html`);
}

async function fetchCached(url: string): Promise<{ body: string; status: number }> {
  const file = cachePath(url);

  if (!refresh && fs.existsSync(file)) {
    const cached = fs.readFileSync(file, 'utf8');
    const [header, ...rest] = cached.split('\n');
    return { status: Number(header), body: rest.join('\n') };
  }

  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xml' },
    redirect: 'follow',
  });
  const body = await response.text();

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, `${response.status}\n${body}`, 'utf8');

  await sleep(DELAY_MS);
  return { body, status: response.status };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&laquo;': '«',
  '&raquo;': '»',
  '&mdash;': '—',
  '&ndash;': '–',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => {
      if (entity in ENTITIES) return ENTITIES[entity]!;
      const numeric = /^&#(\d+);$/.exec(entity);
      return numeric ? String.fromCodePoint(Number(numeric[1])) : entity;
    })
    .replace(/ /g, ' ');
}

function stripNoise(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * Narrows to the Porto theme's content container.
 *
 * The header, the seven-item nav and the footer repeat on all 249 pages; left
 * in, they would drown every word count in the same boilerplate.
 */
function contentRegion(html: string): string {
  const start = html.search(/class="[^"]*\bpage-content\b[^"]*"/);
  if (start === -1) return html;

  // Advance past the rest of the opening tag. Slicing at the class attribute
  // leaves `class="page-content">` sitting in the extracted text, where it
  // inflates every word count by one and becomes the "heading" of any page
  // that has no real one.
  const tagEnd = html.indexOf('>', start);
  const after = html.slice(tagEnd === -1 ? start : tagEnd + 1);
  const end = after.search(/<footer\b|id="footer"|class="[^"]*\bfooter\b/);
  return end === -1 ? after : after.slice(0, end);
}

function textOf(html: string): string {
  return decodeEntities(
    stripNoise(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Every heading in the content region, shallowest first.
 *
 * Which of these is the page's own label cannot be decided from one page in
 * isolation: the theme injects an identical "quick links" widget of h3s into
 * pages that have no heading of their own, so taking the first heading blindly
 * gives those pages the widget's first link as a title. The widget is
 * identified after the crawl by the same frequency test used for boilerplate
 * text — a heading appearing across many pages is furniture, not a title.
 */
function headingsOf(region: string): Array<{ level: number; text: string }> {
  return [...stripNoise(region).matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => ({
    level: Number(match[1]![1]),
    text: decodeEntities(match[2]!.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

function attributesOf(html: string, tag: string, attribute: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'gi');
  return [...html.matchAll(pattern)].map((match) => match[1]!);
}

function localeOf(url: string): Locale {
  const { pathname } = new URL(url);
  if (pathname.startsWith('/en/')) return 'en';
  if (pathname.startsWith('/kz/')) return 'kz';
  return 'ru';
}

function slugOf(url: string): string {
  const { pathname } = new URL(url);
  return pathname.replace(/^\/(en|kz)(?=\/|$)/, '') || '/';
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------

function locsIn(xml: string): string[] {
  return [...xml.matchAll(/<loc>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/loc>/g)].map((m) => m[1]!.trim());
}

async function collectUrls(): Promise<Array<{ url: string; type: string }>> {
  const index = await fetchCached(SITEMAP);
  const children = locsIn(index.body);

  const collected: Array<{ url: string; type: string }> = [];
  for (const child of children) {
    const type = /\/([a-z_]+)-sitemap\.xml/.exec(child)?.[1] ?? 'unknown';
    const { body } = await fetchCached(child);
    for (const url of locsIn(body)) collected.push({ url, type });
    console.log(`  ${type.padEnd(14)} ${locsIn(body).length} urls`);
  }
  return collected;
}

async function main(): Promise<void> {
  console.log(`\nCrawling ${ORIGIN}${refresh ? ' (cache ignored)' : ''}\n`);

  const targets = await collectUrls();
  console.log(`\n${targets.length} URLs total. Fetching…\n`);

  const pages: Array<{
    record: InventoryRecord;
    lines: string[];
    headings: Array<{ level: number; text: string }>;
  }> = [];

  for (const [index, { url, type }] of targets.entries()) {
    const { body, status } = await fetchCached(url);

    const region = contentRegion(body);
    const text = textOf(region);
    const lines = text.split('\n');

    pages.push({
      lines,
      headings: headingsOf(region),
      record: {
        url,
        slug: slugOf(url),
        locale: localeOf(url),
        type,
        status,
        title: decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? '')
          .replace(/\s*[-|]\s*Turkistan International Airport\s*$/i, '')
          .trim(),
        heading: '',
        description: decodeEntities(
          /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(body)?.[1] ?? ''
        ).trim(),
        wordsRaw: text.split(/\s+/).filter(Boolean).length,
        words: 0,
        images: [...new Set(attributesOf(region, 'img', 'src'))],
        iframes: [...new Set(attributesOf(region, 'iframe', 'src'))],
        tables: (region.match(/<table\b/gi) ?? []).length,
        files: [...new Set(attributesOf(region, 'a', 'href'))].filter((href) =>
          /\.(pdf|docx?|xlsx?|pptx?|zip)(\?|$)/i.test(href)
        ),
      },
    });

    if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${targets.length}`);
  }

  // Boilerplate subtraction, per the method note in plan §1.3: a line that
  // appears on 70% of pages is furniture, not content.
  const frequency = new Map<string, number>();
  for (const { lines } of pages) {
    for (const line of new Set(lines)) frequency.set(line, (frequency.get(line) ?? 0) + 1);
  }
  const threshold = pages.length * 0.7;
  const boilerplate = new Set(
    [...frequency].filter(([, count]) => count >= threshold).map(([line]) => line)
  );

  for (const page of pages) {
    page.record.words = page.lines
      .filter((line) => !boilerplate.has(line))
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;
  }

  // A heading that appears across a third of the site is the theme's quick-links
  // widget, not this page's title.
  const headingFrequency = new Map<string, number>();
  for (const page of pages) {
    for (const text of new Set(page.headings.map((h) => h.text))) {
      headingFrequency.set(text, (headingFrequency.get(text) ?? 0) + 1);
    }
  }
  const widgetHeadings = new Set(
    [...headingFrequency].filter(([, n]) => n >= pages.length * 0.3).map(([text]) => text)
  );

  for (const page of pages) {
    const own = page.headings
      .filter((h) => h.text !== '' && !widgetHeadings.has(h.text))
      .sort((a, b) => a.level - b.level)[0];
    page.record.heading = own?.text ?? '';
  }

  const inventory = pages.map((p) => p.record).sort((a, b) => a.url.localeCompare(b.url));

  console.log(`\n${widgetHeadings.size} recurring widget headings ignored`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'inventory.json'),
    JSON.stringify(inventory, null, 2),
    'utf8'
  );

  const csvEscape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [
    'url,slug,locale,type,status,heading,title,words,words_raw,images,iframes,tables,files',
    ...inventory.map((r) =>
      [
        r.url,
        r.slug,
        r.locale,
        r.type,
        r.status,
        r.heading,
        r.words,
        r.wordsRaw,
        r.images.length,
        r.iframes.length,
        r.tables,
        r.files.length,
      ]
        .map(csvEscape)
        .join(',')
    ),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'inventory.csv'), `${csv}\n`, 'utf8');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const byLocale = (locale: Locale) => inventory.filter((r) => r.locale === locale).length;
  const words = inventory.map((r) => r.words).sort((a, b) => a - b);
  const median = words[Math.floor(words.length / 2)] ?? 0;

  console.log(`\n${boilerplate.size} boilerplate lines removed (present on ≥70% of pages)\n`);
  console.log(`Inventory: ${inventory.length} URLs`);
  console.log(`  ru ${byLocale('ru')}   en ${byLocale('en')}   kz ${byLocale('kz')}`);
  console.log(`  median ${median} words, ${inventory.filter((r) => r.words < 25).length} under 25`);
  console.log(`  ${inventory.filter((r) => r.iframes.length > 0).length} with an embed`);
  console.log(`  ${inventory.filter((r) => r.files.length > 0).length} with attachments`);
  console.log(`  ${inventory.filter((r) => r.status !== 200).length} non-200\n`);
  console.log(`Wrote migration/inventory.json and migration/inventory.csv\n`);
}

await main();
