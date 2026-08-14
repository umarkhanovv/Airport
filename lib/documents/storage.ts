import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { env } from '../env.ts';

import {
  DOCUMENT_TYPES,
  DocumentRejectedError,
  MAX_DOCUMENT_BYTES,
  STORED_NAME_RE,
  extensionOf,
} from './types.ts';

/**
 * Where documents are kept.
 *
 * `DATA_DIR/uploads/documents`, served by `app/api/documents/[name]`, never
 * from `public/` — the same rule as news images and for the same reason:
 * anything inside a web root is served by filename, so a file that got in with
 * an unexpected extension would be served as whatever the extension implies.
 * Here the response type is chosen by the handler from the whitelist in
 * `types.ts`, which this module also enforces on the way in.
 *
 * Unlike news covers, the type is decided by the uploaded *name* rather than by
 * the bytes. Deliberately: a `.docx` is a zip, an `.xlsx` is a zip, and a PDF
 * header says nothing about whether the file is the tender protocol it claims
 * to be — sniffing would buy nothing the whitelist does not already give, while
 * rejecting perfectly ordinary files staff will upload. Everything served from
 * here goes out as an attachment under `Content-Security-Policy: sandbox`, so
 * the browser never renders it inside this site's origin whatever it is.
 */

/** Validates and stores one file, returning the generated name. */
export function storeDocument(buffer: Buffer, uploadedName: string): string {
  if (buffer.length === 0) {
    throw new DocumentRejectedError('errorEmpty', `${uploadedName} is empty.`, {
      filename: uploadedName,
    });
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    const size = (buffer.length / 1024 / 1024).toFixed(1);
    throw new DocumentRejectedError(
      'errorTooLarge',
      `${uploadedName} is ${size} MB. The limit is 25 MB.`,
      { filename: uploadedName, size }
    );
  }

  const extension = extensionOf(uploadedName);
  if (!DOCUMENT_TYPES[extension]) {
    const allowed = Object.keys(DOCUMENT_TYPES).join(', ');
    throw new DocumentRejectedError(
      'errorNotADocument',
      `${uploadedName} is not a document. Allowed: ${allowed}.`,
      { filename: uploadedName, allowed }
    );
  }

  fs.mkdirSync(env.paths.documentUploads, { recursive: true });

  const storedName = `${crypto.randomUUID()}${extension}`;
  fs.writeFileSync(path.join(env.paths.documentUploads, storedName), buffer);

  return storedName;
}

/**
 * Deletes a stored file.
 *
 * The name comes from a row this application wrote, and is still checked
 * against the generated shape before becoming a path — the cost of being wrong
 * about that is deleting an arbitrary file.
 */
export function deleteDocumentFile(storedName: string): void {
  if (!STORED_NAME_RE.test(storedName)) return;
  fs.rmSync(path.join(env.paths.documentUploads, storedName), { force: true });
}
