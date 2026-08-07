/**
 * HTML extraction primitives shared by the Stage 8 migration scripts.
 *
 * Three scripts read the same crawled pages for three different reasons —
 * `crawl.mts` to triage them, `generate.mts` to convert them, and
 * `verify-content.mts` to show what a page actually holds — and all three need
 * the same handful of primitives. They lived in duplicate until the third
 * script needed them.
 *
 * The two places where the original copies disagreed are kept as options
 * rather than unified away, because each behaviour is deliberate and changing
 * either one would silently move the numbers in `migration/inventory.json`.
 *
 * Deliberately dependency-free and regex-based, for the reason given in
 * `crawl.mts`: this corpus is one WordPress theme, and extraction only has to
 * be good enough to triage and to convert short prose.
 */

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

/**
 * Decodes the entities this theme actually emits.
 *
 * `collapseNbsp` additionally folds literal U+00A0 characters — as opposed to
 * `&nbsp;` sequences — down to ordinary spaces. Word counting wants that, so a
 * paragraph padded with non-breaking spaces does not read as one long word.
 * Conversion to MDX does not: an author who typed a non-breaking space between
 * a number and its unit meant it, and it should survive into the new page.
 */
export function decodeEntities(value: string, { collapseNbsp = false } = {}): string {
  const decoded = value.replace(/&[a-z]+;|&#\d+;/gi, (entity) => {
    if (entity in ENTITIES) return ENTITIES[entity]!;
    const numeric = /^&#(\d+);$/.exec(entity);
    return numeric ? String.fromCodePoint(Number(numeric[1])) : entity;
  });

  return collapseNbsp ? decoded.replace(/\u00a0/g, ' ') : decoded;
}

/** Removes everything that is markup machinery rather than page content. */
export function stripNoise(html: string): string {
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
 *
 * `whenMissing` decides what a page without the container yields. The crawler
 * wants `'whole'` — it is triaging, and a page it cannot narrow should be
 * reported at full length so the anomaly is visible rather than counted as
 * empty. Every other caller wants `'empty'`: converting a whole document,
 * chrome included, would publish the legacy nav into the new site.
 */
export function contentRegion(
  html: string,
  { whenMissing = 'empty' }: { whenMissing?: 'empty' | 'whole' } = {}
): string {
  const start = html.search(/class="[^"]*\bpage-content\b[^"]*"/);
  if (start === -1) return whenMissing === 'whole' ? html : '';

  // Advance past the rest of the opening tag. Slicing at the class attribute
  // leaves `class="page-content">` sitting in the extracted text, where it
  // inflates every word count by one and becomes the "heading" of any page
  // that has no real one.
  const tagEnd = html.indexOf('>', start);
  const after = html.slice(tagEnd === -1 ? start : tagEnd + 1);
  const end = after.search(/<footer\b|id="footer"|class="[^"]*\bfooter\b/);
  if (end === -1) return after;

  // The cut lands on the footer's class attribute, which is a few characters
  // inside its opening tag — so the region ends with a `<div ` that has no
  // closing bracket. Nothing that strips tags can match it, and it survives
  // into the extracted text as a word, giving every page on the site a word
  // count one higher than it has earned. An empty page then reports "1 word",
  // which reads like content rather than like nothing.
  return after.slice(0, end).replace(/<[^>]*$/, '');
}

/**
 * Removes the theme's blog listing from a content region.
 *
 * A few legacy pages embed a feed of recent news posts below their own text.
 * Those posts are not the page: they are news, and the new site serves news
 * from its database, so migrating them into a static page would freeze a
 * snapshot of 2023 into a page about the airport's history and duplicate every
 * post at a second URL.
 *
 * The theme marks each post with an `<article>` that opens inside the region.
 * The page's own wrapping `<article>` opens above it — outside the region —
 * which is what makes the two safely distinguishable without balancing tags.
 */
export function stripPostListing(region: string): { region: string; posts: number } {
  const pattern = /<article\b[^>]*>[\s\S]*?<\/article>/gi;
  return {
    region: region.replace(pattern, ' '),
    posts: (region.match(pattern) ?? []).length,
  };
}

/** Flattens a region to one line of text per block element. */
export function textOf(html: string): string {
  return decodeEntities(
    stripNoise(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
    { collapseNbsp: true }
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Every value of one attribute on one tag, in document order. */
export function attributesOf(html: string, tag: string, attribute: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'gi');
  return [...html.matchAll(pattern)].map((match) => match[1]!);
}
