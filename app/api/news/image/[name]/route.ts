import fs from 'node:fs';
import path from 'node:path';

import { env } from '@/lib/env';

/** Reads the filesystem; never the Edge runtime (plan §3.4). */
export const runtime = 'nodejs';

/**
 * Serves a news cover image from DATA_DIR.
 *
 * Uploaded files deliberately live outside `public/` — anything in a web root
 * is served by filename, and an upload that slipped through with an unexpected
 * extension would then be served as whatever that extension implies. Routing
 * them through a handler means the content type is decided here, from a
 * whitelist, and never inferred from what the uploader called the file.
 */

const ALLOWED: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;

  // Reject anything that is not a bare filename before touching the disk.
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return new Response('Not found.', { status: 404 });
  }

  const contentType = ALLOWED[path.extname(name).toLowerCase()];
  if (!contentType) return new Response('Not found.', { status: 404 });

  const directory = path.resolve(env.paths.newsUploads);
  const file = path.resolve(directory, name);

  // Belt and braces: even with the checks above, never serve outside the
  // uploads directory.
  if (!file.startsWith(directory + path.sep)) {
    return new Response('Not found.', { status: 404 });
  }

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response('Not found.', { status: 404 });
  }

  const body = fs.readFileSync(file);

  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': contentType,
      'content-length': String(body.length),
      // Filenames are generated and never reused, so these can cache hard.
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // Defence in depth if an image ever turned out not to be one.
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
