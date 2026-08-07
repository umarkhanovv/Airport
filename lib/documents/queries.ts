import 'server-only';

import crypto from 'node:crypto';

import { and, asc, desc, eq } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { documents, type DocumentRow } from '../db/schema.ts';

import { deleteDocumentFile } from './storage.ts';

/**
 * Documents published on content pages (spec §5).
 *
 * The public read is filtered to published rows; the admin reads are not. Both
 * live here rather than in two files as news does, because unlike a news post a
 * document has no body to render and no translations to resolve — the whole
 * surface is a list, a title and a file.
 */

export interface PublishedDocument {
  id: string;
  title: string;
  storedName: string;
  originalFilename: string;
  sizeBytes: number;
  publishedAt: string;
}

/** One page's published documents, newest first. */
export function listDocumentsForPage(pagePath: string): PublishedDocument[] {
  return getDb()
    .select({
      id: documents.id,
      title: documents.title,
      storedName: documents.storedName,
      originalFilename: documents.originalFilename,
      sizeBytes: documents.sizeBytes,
      publishedAt: documents.publishedAt,
    })
    .from(documents)
    .where(and(eq(documents.pagePath, pagePath), eq(documents.isPublished, true)))
    .orderBy(desc(documents.publishedAt), asc(documents.title))
    .all();
}

/** Every document, drafts included, grouped for the admin list. */
export function listAllDocuments(): DocumentRow[] {
  return getDb()
    .select()
    .from(documents)
    .orderBy(asc(documents.pagePath), desc(documents.publishedAt))
    .all();
}

export function getDocumentById(id: string): DocumentRow | null {
  return getDb().select().from(documents).where(eq(documents.id, id)).limit(1).all()[0] ?? null;
}

/** Looked up by stored name so the serving route can send the original name. */
export function getDocumentByStoredName(storedName: string): DocumentRow | null {
  return (
    getDb()
      .select()
      .from(documents)
      .where(eq(documents.storedName, storedName))
      .limit(1)
      .all()[0] ?? null
  );
}

export interface NewDocument {
  pagePath: string;
  title: string;
  storedName: string;
  originalFilename: string;
  sizeBytes: number;
  publishedAt: string;
  isPublished?: boolean;
  legacyUrl?: string | null;
}

export function createDocument(input: NewDocument): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  getDb()
    .insert(documents)
    .values({
      id,
      pagePath: input.pagePath,
      title: input.title,
      storedName: input.storedName,
      originalFilename: input.originalFilename,
      sizeBytes: input.sizeBytes,
      publishedAt: input.publishedAt,
      isPublished: input.isPublished ?? true,
      legacyUrl: input.legacyUrl ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

/** Renames or re-files a document. The file itself is never touched. */
export function updateDocument(
  id: string,
  changes: { title?: string; pagePath?: string; publishedAt?: string; isPublished?: boolean }
): void {
  getDb()
    .update(documents)
    .set({ ...changes, updatedAt: new Date().toISOString() })
    .where(eq(documents.id, id))
    .run();
}

/** Deletes the row and the file behind it, in that order. */
export function deleteDocument(id: string): void {
  const existing = getDocumentById(id);
  if (!existing) return;

  getDb().delete(documents).where(eq(documents.id, id)).run();
  deleteDocumentFile(existing.storedName);
}
