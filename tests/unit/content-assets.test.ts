import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every local asset a migrated page links to is actually served.
 *
 * The images migrated in Stage 8 live in `public/media/legacy/` and are
 * referenced by hashed filename, which is exactly the kind of reference that
 * rots silently: delete one and the page still builds, still renders, and shows
 * a broken image to a visitor.
 *
 * Documents are deliberately *not* checked here. They were going to be
 * committed alongside the images until the client pointed out that procurement
 * notices change weekly and do not belong in a deploy, so they now live in the
 * database and are uploaded through `/admin/documents`. What replaces this
 * check for them is `tests/e2e/admin-documents.spec.ts`, which follows one from
 * upload to the page and back off it again.
 */

const ROOT = path.resolve(__dirname, '../..');
const CONTENT = path.join(ROOT, 'content');
const PUBLIC = path.join(ROOT, 'public');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.mdx') ? [full] : [];
  });
}

/** Every markdown link and image target in the content tree. */
function links(): Array<{ page: string; target: string }> {
  return walk(CONTENT).flatMap((file) => {
    const page = path.relative(ROOT, file);
    return [...fs.readFileSync(file, 'utf8').matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)].map(
      (match) => ({ page, target: match[1]! })
    );
  });
}

describe('migrated content assets', () => {
  it('serves every image a page references', () => {
    const missing = links()
      .filter((link) => link.target.startsWith('/media/'))
      .filter((link) => !fs.existsSync(path.join(PUBLIC, decodeURIComponent(link.target))));

    expect(missing.map((link) => `${link.page} → ${link.target}`)).toEqual([]);
  });

  it('references those images by a name that cannot escape public/', () => {
    // The names are generated hashes, so anything else is a hand edit.
    const wrong = links()
      .filter((link) => link.target.startsWith('/media/'))
      .filter((link) => !/^\/media\/legacy\/[0-9a-f]{16}\.[a-z]{3,4}$/.test(link.target));

    expect(wrong.map((link) => `${link.page} → ${link.target}`)).toEqual([]);
  });
});
