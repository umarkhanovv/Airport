/**
 * Slug generation for news posts.
 *
 * The legacy site publishes percent-encoded Cyrillic slugs — a real URL from
 * hsairport.kz looks like:
 *
 *   /kz/%d1%82%d2%af%d1%80%d0%ba%d1%96%d1%81%d1%82%d0%b0%d0%bd...
 *
 * They are unreadable, unshareable, break when copied into plain text, and
 * one post has no slug at all (`/6336/`). So slugs are regenerated from the
 * title rather than carried over (plan §1.5), with the old URL kept on the
 * record so redirects can be built in Stage 8.
 *
 * Transliteration covers Russian **and** the nine Kazakh-specific letters.
 * Dropping the Kazakh ones would silently mangle every Kazakh headline into
 * something shorter and wrong.
 */

/**
 * Cyrillic → Latin. Longest keys first matters for nothing here (all keys are
 * single characters), but the Kazakh letters must be listed explicitly — they
 * are not decomposable from the Russian set.
 */
const TRANSLITERATION: Record<string, string> = {
  // Russian
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',

  // Kazakh-specific (plan §6.3 — the same nine letters that break webfonts)
  ә: 'a',
  ғ: 'g',
  қ: 'q',
  ң: 'ng',
  ө: 'o',
  ұ: 'u',
  ү: 'u',
  һ: 'h',
  і: 'i',
};

/** Converts a title into a URL-safe, readable slug. */
export function slugify(input: string, maxLength = 70): string {
  const transliterated = [...input.toLowerCase()]
    .map((char) => TRANSLITERATION[char] ?? char)
    .join('');

  const slug = transliterated
    // Strip accents left over from Latin-script titles (Türkistan → turkistan).
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= maxLength) return slug;

  // Trim at a word boundary rather than mid-word.
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > maxLength * 0.6 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/**
 * Makes a slug unique within a locale.
 *
 * Two posts genuinely can share a title — an annual announcement, say — and a
 * collision would otherwise overwrite one of them.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const seed = base || 'post';
  if (!used.has(seed)) return seed;

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${seed}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // Practically unreachable; better than looping forever.
  return `${seed}-${Date.now()}`;
}
