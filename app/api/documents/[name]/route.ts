import fs from 'node:fs';
import path from 'node:path';

import { getDocumentByStoredName } from '@/lib/documents/queries';
import { DOCUMENT_TYPES, STORED_NAME_RE, extensionOf } from '@/lib/documents/types';
import { env } from '@/lib/env';

/** Reads the filesystem; never the Edge runtime (plan §3.4). */
export const runtime = 'nodejs';

/**
 * Serves a published document from DATA_DIR.
 *
 * Uploads deliberately live outside `public/`, so the response type is decided
 * here from a whitelist rather than inferred from what someone called the file.
 * Everything is sent as an attachment, sandboxed, with sniffing off — a
 * procurement notice is downloaded and opened in Word, never rendered inside
 * this site's origin.
 *
 * The database is consulted, not just the disk: an unpublished document must
 * not be readable by anyone who guesses its filename, and the original name is
 * needed for the download.
 */

/** RFC 5987, so a Cyrillic filename survives the header. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;

  // Rejected before the disk is touched: only names this application generated
  // are ever valid, so anything else is refused rather than sanitised.
  if (!name || !STORED_NAME_RE.test(name)) {
    return new Response('Not found.', { status: 404 });
  }

  const contentType = DOCUMENT_TYPES[extensionOf(name)];
  if (!contentType) return new Response('Not found.', { status: 404 });

  const record = getDocumentByStoredName(name);
  if (!record || !record.isPublished) return new Response('Not found.', { status: 404 });

  const directory = path.resolve(env.paths.documentUploads);
  const file = path.resolve(directory, name);
  if (!file.startsWith(directory + path.sep)) return new Response('Not found.', { status: 404 });

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response('Not found.', { status: 404 });
  }

  const body = fs.readFileSync(file);

  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': contentType,
      'content-length': String(body.length),
      'content-disposition': contentDisposition(record.originalFilename),
      // Names are generated and never reused, so this can cache hard. The
      // database check above is what makes unpublishing effective — a URL
      // nobody has ever fetched has nothing cached.
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
