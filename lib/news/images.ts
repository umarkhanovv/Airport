import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { env } from '../env.ts';

/**
 * Cover images for news posts (spec §7, plan §9.1).
 *
 * Uploads land in `DATA_DIR/uploads/news` and are served by
 * `app/api/news/image/[name]`, never from `public/`. The reasoning is in that
 * route: anything inside a web root is served by filename, so a file that got
 * in with an unexpected extension would be served as whatever the extension
 * implies.
 *
 * This module is the other half of that guarantee. The stored extension is
 * decided from the bytes, not from what the uploader called the file, so the
 * two whitelists cannot drift apart — a file the route would refuse to serve
 * can never be written in the first place.
 */

/** Comfortably above a press photo, far below anything worth storing. */
export const MAX_COVER_BYTES = 2 * 1024 * 1024;

export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

/**
 * The formats `app/api/news/image/[name]` will serve, identified by signature.
 *
 * JPEG, PNG and GIF are found at offset 0. WebP and AVIF are both container
 * formats whose marker sits at offset 8 and 4 respectively, after a length
 * field — which is why this is a function rather than a table of prefixes.
 */
export function detectImageExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png';
  }

  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return '.webp';
  }

  // ISO base media file: `ftyp` then a brand. `avif` is the still image;
  // `avis` is an image sequence, which the route serves under the same type.
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return '.avif';
  }

  return null;
}

/**
 * Validates and stores a cover image, returning the filename to put in the
 * `cover_image` column. Names are generated and never reused, which is what
 * lets the serving route cache them permanently.
 */
export function storeNewsCover(buffer: Buffer): string {
  if (buffer.length === 0) {
    throw new ImageRejectedError('That file is empty.');
  }
  if (buffer.length > MAX_COVER_BYTES) {
    throw new ImageRejectedError(
      `That image is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`
    );
  }

  const extension = detectImageExtension(buffer);
  if (!extension) {
    throw new ImageRejectedError('That is not a JPEG, PNG, WebP or AVIF image.');
  }

  fs.mkdirSync(env.paths.newsUploads, { recursive: true });

  const name = `${crypto.randomUUID()}${extension}`;
  fs.writeFileSync(path.join(env.paths.newsUploads, name), buffer);

  return name;
}

/**
 * Deletes a stored cover.
 *
 * Called when a post is deleted or its image replaced. The name comes from a
 * database row this application wrote, but it is still checked against the
 * generated shape before being turned into a path — the cost of being wrong
 * about that is deleting an arbitrary file.
 */
export function deleteNewsCover(name: string | null): void {
  if (!name || !/^[0-9a-f-]{36}\.(jpg|png|webp|avif)$/.test(name)) return;

  fs.rmSync(path.join(env.paths.newsUploads, name), { force: true });
}
