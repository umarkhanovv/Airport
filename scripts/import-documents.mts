/**
 * Bulk-import a folder of documents onto a content page.
 *
 *   npm run documents:import -- ./downloads --page=press/announcements
 *   npm run documents:import -- ./downloads --page=flights/cargo --dry-run
 *
 * Exists because the announcements page carries 188 files. Uploading those
 * through the admin form once, to seed the library from the legacy site, would
 * be an afternoon of clicking; after that the form is the right tool, which is
 * why this is a one-off script rather than a feature.
 *
 * Titles are not taken from filenames where something better is available. The
 * migrated pages in `content/` still hold the legacy captions — "Приказ КД от
 * 04.08.2026 года." — recovered from the old site's markup, and each sits next
 * to a link whose filename identifies the document. So a file called
 * `приказКД-10.docx` is titled from the caption that was printed above it,
 * rather than from a name nobody wrote for a reader.
 *
 * Run against the airport's DATA_DIR:
 *
 *   DATA_DIR=/var/lib/hsairport npm run documents:import -- ./downloads --page=press/announcements
 */
import fs from 'node:fs';
import path from 'node:path';

import { createDocument, listAllDocuments } from '../lib/documents/queries.ts';
import { storeDocument } from '../lib/documents/storage.ts';
import { DOCUMENT_TYPES, displayFilename, titleFromFilename } from '../lib/documents/types.ts';

const CONTENT_DIR = path.join(process.cwd(), 'content');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const folder = args.find((arg) => !arg.startsWith('--'));
const pagePath = args.find((arg) => arg.startsWith('--page='))?.slice('--page='.length);

if (!folder || !pagePath) {
  console.error(
    'Usage: npm run documents:import -- <folder> --page=<section/page> [--dry-run]\n' +
      '  e.g. npm run documents:import -- ./downloads --page=press/announcements'
  );
  process.exit(1);
}

if (!fs.existsSync(path.join(CONTENT_DIR, 'ru', `${pagePath}.mdx`))) {
  console.error(`No such content page: content/ru/${pagePath}.mdx`);
  process.exit(1);
}

/**
 * Captions from the migrated page, keyed by the filename they linked to.
 *
 * The legacy markup put each caption in a paragraph immediately above the table
 * row holding its link, which is how the converter emitted them — so the
 * nearest preceding non-empty line that is not itself a link is the caption for
 * that file.
 */
function captionsFromPage(): Map<string, string> {
  const source = fs.readFileSync(path.join(CONTENT_DIR, 'ru', `${pagePath}.mdx`), 'utf8');
  const lines = source.split('\n');
  const captions = new Map<string, string>();

  for (const [index, line] of lines.entries()) {
    const link = /\]\((https?:\/\/[^)\s]+)\)/.exec(line);
    if (!link) continue;

    const filename = decodeURIComponent(new URL(link[1]!).pathname.split('/').pop() ?? '');
    if (!filename || captions.has(filename)) continue;

    for (let above = index - 1; above >= 0 && above > index - 5; above -= 1) {
      const candidate = lines[above]!.trim();
      if (candidate === '' || candidate.startsWith('|') || candidate.includes('](')) continue;
      captions.set(filename, candidate.replace(/\s+/g, ' ').slice(0, 200));
      break;
    }
  }

  return captions;
}

/** `2026/08` in the legacy path is the month the file was published. */
function dateFromCaption(caption: string | undefined, fallback: string): string {
  const match = /(\d{2})\.(\d{2})\.(\d{4})/.exec(caption ?? '');
  return match ? `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z` : fallback;
}

function main(): void {
  const captions = captionsFromPage();
  const existing = new Set(listAllDocuments().map((row) => row.originalFilename));

  const files = fs
    .readdirSync(folder!, { withFileTypes: true })
    .filter((entry) => entry.isFile() && DOCUMENT_TYPES[path.extname(entry.name).toLowerCase()])
    .map((entry) => entry.name)
    .sort();

  console.log(`\n${files.length} document(s) in ${folder}`);
  console.log(`${captions.size} caption(s) recovered from content/ru/${pagePath}.mdx\n`);

  const today = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  let imported = 0;
  let skipped = 0;
  let untitled = 0;

  for (const name of files) {
    const display = displayFilename(name);

    // Re-running must not duplicate. The uploaded name is the identity here;
    // the stored name is generated fresh each time and cannot be compared.
    if (existing.has(display)) {
      skipped += 1;
      continue;
    }

    const caption = captions.get(name) ?? captions.get(display);
    if (!caption) untitled += 1;

    const title = caption ?? titleFromFilename(name);
    const publishedAt = dateFromCaption(caption, today);

    console.log(`  ${caption ? ' ' : '?'} ${title.slice(0, 68).padEnd(68)} ${display}`);

    if (!dryRun) {
      const buffer = fs.readFileSync(path.join(folder!, name));
      createDocument({
        pagePath: pagePath!,
        title,
        storedName: storeDocument(buffer, name),
        originalFilename: display,
        sizeBytes: buffer.length,
        publishedAt,
      });
    }
    imported += 1;
  }

  console.log(`\n${dryRun ? 'Would import' : 'Imported'} ${imported}`);
  if (skipped > 0) console.log(`${skipped} already in the library, skipped`);
  if (untitled > 0) {
    console.log(
      `${untitled} had no caption on the page and are titled from their filename — ` +
        `marked "?" above, and worth correcting in /admin/documents`
    );
  }
  console.log();
}

main();
