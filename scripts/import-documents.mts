/**
 * Import a folder of documents downloaded from the legacy site.
 *
 *   npm run documents:import -- --dry-run     # show what would happen
 *   npm run documents:import                  # do it
 *
 * One folder, no sorting. Put every file from hsairport.kz into
 * `documents-inbox/` and run this: each one is filed against the page it was
 * published on and given the title it was published under, both read out of
 * the migrated content tree.
 *
 * That works because Stage 8 kept the evidence. Every legacy page in `content/`
 * still holds the links it had — `.../приказКД-10.docx` — and the captions
 * printed above them, recovered from the old site's markup. So a filename
 * identifies a document uniquely, and the page and caption follow from it. A
 * file the tree does not mention is reported rather than guessed at; it can be
 * filed by hand in /admin/documents, which is a handful of clicks rather than
 * two hundred.
 *
 * Options:
 *   --folder=<path>   default `documents-inbox`
 *   --page=<path>     where to file anything the tree does not mention
 *   --dry-run         print the plan and write nothing
 *
 * Against the airport's own data directory:
 *
 *   DATA_DIR=/var/lib/hsairport npm run documents:import
 */
import fs from 'node:fs';
import path from 'node:path';

import { createDocument, listAllDocuments } from '../lib/documents/queries.ts';
import { storeDocument } from '../lib/documents/storage.ts';
import { DOCUMENT_TYPES, displayFilename, titleFromFilename } from '../lib/documents/types.ts';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content');

const args = process.argv.slice(2);
const flag = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];

const dryRun = args.includes('--dry-run');
const folder = path.resolve(
  ROOT,
  flag('folder') ?? args.find((a) => !a.startsWith('--')) ?? 'documents-inbox'
);
const fallbackPage = flag('page') ?? null;

interface Placement {
  pagePath: string;
  caption?: string;
}

/**
 * The form a filename is compared in.
 *
 * Unicode normalisation, and it is not a detail: macOS writes filenames in NFD,
 * where `й` is `и` followed by a combining breve, while the legacy site's URLs
 * carry the composed NFC form. The two are the same name and different strings,
 * so 40 of the 178 announcements documents did not match until this was here —
 * and they were exactly the ones whose names happen to contain й, ё or ұ.
 *
 * Case is folded too. A download that arrives as `ПРОТОКОЛ-ИТОГОВ.pdf` is the
 * document the page calls `протокол-итогов.pdf`.
 */
const key = (filename: string) => filename.normalize('NFC').toLowerCase();

// ---------------------------------------------------------------------------
// What the legacy pages say about each file
// ---------------------------------------------------------------------------

function contentFiles(): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.mdx') ? [full] : [];
    });

  return fs.existsSync(CONTENT_DIR) ? walk(CONTENT_DIR) : [];
}

/**
 * Filename → the page it was published on, and what it was called there.
 *
 * All three languages are scanned, because the page path is the same in each
 * and some documents only ever appeared on one of them — the flight safety
 * policy is linked from the English page and the Kazakh one, and each links a
 * different file.
 *
 * The caption is the nearest paragraph above the link. That is how the legacy
 * markup was laid out and how the converter emitted it: a line of prose naming
 * the document, then the table row holding its "Скачать".
 */
function placements(): Map<string, Placement> {
  const found = new Map<string, Placement>();

  for (const file of contentFiles()) {
    // content/<locale>/<section>/<page>.mdx → <section>/<page>
    const relative = path.relative(CONTENT_DIR, file).replace(/\.mdx$/, '');
    const pagePath = relative.split(path.sep).slice(1).join('/');

    const lines = fs.readFileSync(file, 'utf8').split('\n');

    for (const [index, line] of lines.entries()) {
      // Absolute and root-relative alike: the legacy site linked four of its
      // own tender documents as `/wp-content/…`, and only the filename is
      // needed here, not a resolvable address.
      const link = /\]\(((?:https?:\/\/|\/)[^)\s]+)\)/.exec(line);
      if (!link) continue;

      let name: string;
      try {
        const pathname = link[1]!.startsWith('/') ? link[1]! : new URL(link[1]!).pathname;
        name = decodeURIComponent(pathname.split('/').pop() ?? '');
      } catch {
        continue;
      }
      if (!name || !DOCUMENT_TYPES[path.extname(name).toLowerCase()]) continue;
      if (found.has(key(name))) continue;

      let caption: string | undefined;
      for (let above = index - 1; above >= 0 && above > index - 5; above -= 1) {
        const candidate = lines[above]!.trim();
        if (candidate === '' || candidate.startsWith('|') || candidate.includes('](')) continue;
        caption = candidate.replace(/\s+/g, ' ').slice(0, 200);
        break;
      }

      // Failing that, the label in the row's own first cell.
      //
      // The legacy page pairs each order with a blank lease template under it,
      // and only the first of the pair gets a sentence above it — so a third of
      // the announcements would otherwise be titled from their filename, which
      // is how "Договор аренды типовой" becomes "Duty free".
      if (!caption && line.trim().startsWith('|')) {
        const cell = line
          .split('|')[1]
          ?.replace(/\s+/g, ' ')
          .replace(/\s*:\s*$/, '')
          .trim();
        if (cell) caption = cell.slice(0, 200);
      }

      found.set(key(name), { pagePath, caption });
    }
  }

  return found;
}

/** `dd.mm.yyyy`, as the airport writes dates in these captions. */
const DATE_RE = /(\d{2})\.(\d{2})\.(\d{4})/;

/** A caption like "Приказ КД от 04.08.2026 года." also carries the date. */
function dateFrom(caption: string | undefined, fallback: string): string {
  const match = DATE_RE.exec(caption ?? '');
  return match ? `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z` : fallback;
}

// ---------------------------------------------------------------------------

function main(): void {
  if (!fs.existsSync(folder)) {
    console.error(
      `\nNo such folder: ${path.relative(ROOT, folder)}\n\n` +
        `Create it, put the files from hsairport.kz in it, and run this again:\n` +
        `  mkdir -p documents-inbox\n`
    );
    process.exit(1);
  }

  const known = placements();
  const already = new Set(listAllDocuments().map((row) => row.originalFilename));

  const files = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && DOCUMENT_TYPES[path.extname(entry.name).toLowerCase()])
    .map((entry) => entry.name)
    .sort();

  console.log(`\n${files.length} document(s) in ${path.relative(ROOT, folder)}`);
  console.log(`${known.size} known from the migrated pages\n`);

  const today = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const onPage = new Map<string, number>();
  const unplaced: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const name of files) {
    const display = displayFilename(name);

    // Re-running must not duplicate. The uploaded name is the identity; the
    // stored name is generated fresh each time and cannot be compared.
    if (already.has(display)) {
      skipped += 1;
      continue;
    }

    const placement = known.get(key(name)) ?? known.get(key(display));
    const pagePath = placement?.pagePath ?? fallbackPage;

    if (!pagePath) {
      unplaced.push(display);
      continue;
    }

    const title = placement?.caption ?? titleFromFilename(name);
    onPage.set(pagePath, (onPage.get(pagePath) ?? 0) + 1);

    if (!dryRun) {
      const buffer = fs.readFileSync(path.join(folder, name));
      createDocument({
        pagePath,
        title,
        storedName: storeDocument(buffer, name),
        originalFilename: display,
        sizeBytes: buffer.length,
        publishedAt: dateFrom(placement?.caption, today),
      });
    }
    imported += 1;
  }

  console.log(`${dryRun ? 'Would import' : 'Imported'} ${imported}:`);
  for (const [page, count] of [...onPage].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  /${page}`);
  }

  if (skipped > 0) console.log(`\n${skipped} already in the library, skipped`);

  if (unplaced.length > 0) {
    console.log(
      `\n${unplaced.length} file(s) are not mentioned by any migrated page, so there is ` +
        `nothing to say which page they belong on. Upload these in /admin/documents, or ` +
        `re-run with --page=<section/page> to put them all somewhere:`
    );
    for (const name of unplaced.slice(0, 20)) console.log(`  ${name}`);
    if (unplaced.length > 20) console.log(`  … and ${unplaced.length - 20} more`);
  }

  if (dryRun) console.log('\nNothing was written. Drop --dry-run to import.');
  console.log();
}

main();
