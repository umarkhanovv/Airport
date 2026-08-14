/**
 * What a document is, without touching a disk.
 *
 * Split from `storage.ts` because the upload form is a client component and
 * needs the accepted formats and the size cap to build its `accept` attribute
 * and its hint text. `storage.ts` is `server-only`, so importing it there is a
 * build error — which is the rule working, not an obstacle to route around.
 */

/** Comfortably above a scanned protocol; the largest on the legacy site is 6 MB. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/**
 * Extension → the type it is served as. Nothing outside this can be uploaded,
 * and `app/api/documents/[name]` chooses its response type from the same table,
 * so the two cannot drift apart.
 */
export const DOCUMENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

/**
 * The generated-name shape, so a name from the database can never be a path.
 *
 * Built from the table above rather than written out, because the loose version
 * — thirty-six hex-and-dash characters, then three or four letters — accepted
 * `…-70867728950e.html`. The serving route would still have refused to send it,
 * having no type for `.html`, but a check whose job is to decide what becomes a
 * filesystem path should not depend on a second one catching it.
 */
export const STORED_NAME_RE = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` +
    `(${Object.keys(DOCUMENT_TYPES)
      .map((extension) => extension.replace('.', '\\.'))
      .join('|')})$`
);

/**
 * Why a file was refused, as a message key. Same reasoning as
 * `UploadRejectedError`: this runs on the server with no locale, so it names
 * the message and carries the values that go in it. `Admin.documents` in the
 * catalogues holds the wording; the English `message` is for stack traces.
 */
export type DocumentRejection = 'errorEmpty' | 'errorTooLarge' | 'errorNotADocument';

export class DocumentRejectedError extends Error {
  readonly code: DocumentRejection;
  readonly params: Record<string, string | number>;

  constructor(code: DocumentRejection, message: string, params: Record<string, string | number>) {
    super(message);
    this.name = 'DocumentRejectedError';
    this.code = code;
    this.params = params;
  }
}

/** Lowercased, including the dot. `path.extname` is not available on a client. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/**
 * Keeps the uploaded name for display and for the download filename without
 * ever letting it near a path. Separators and control characters go, and the
 * result is length-capped so it cannot bloat a row or a table cell.
 */
export function displayFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'document';
  const cleaned = base.replace(/[\p{Cc}"]/gu, '').trim();
  return (cleaned === '' ? 'document' : cleaned).slice(0, 160);
}

/** A sensible default title: the filename, without its extension or dashes. */
export function titleFromFilename(filename: string): string {
  const base = displayFilename(filename);
  const stem = base.slice(0, base.length - extensionOf(base).length) || base;
  return stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}
