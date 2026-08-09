import 'server-only';

import crypto from 'node:crypto';

import { count, desc, eq } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { feedbackSubmissions, type FeedbackSubmission } from '../db/schema.ts';

import type { FeedbackInput } from './types.ts';

/**
 * Feedback persistence.
 *
 * Storing the submission is the feature, not a side effect of it: with no SMTP
 * configured the database and the admin inbox are the entire delivery path
 * (spec §9). So this write happens first and email, if any, follows.
 */

export function saveFeedback(input: FeedbackInput, ipHash: string | null): FeedbackSubmission {
  const row = {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    phone: input.phone,
    subject: input.subject,
    message: input.message,
    locale: input.locale,
    createdAt: new Date().toISOString(),
    isRead: false,
    ipHash,
  };

  getDb().insert(feedbackSubmissions).values(row).run();

  return row;
}

/** Newest first. The inbox is small enough that a page of 50 is the whole job. */
export function listFeedback(limit = 50): FeedbackSubmission[] {
  return getDb()
    .select()
    .from(feedbackSubmissions)
    .orderBy(desc(feedbackSubmissions.createdAt))
    .limit(limit)
    .all();
}

export function countUnreadFeedback(): number {
  const rows = getDb()
    .select({ value: count() })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.isRead, false))
    .all();

  return rows[0]?.value ?? 0;
}

export function setFeedbackRead(id: string, isRead: boolean): void {
  getDb().update(feedbackSubmissions).set({ isRead }).where(eq(feedbackSubmissions.id, id)).run();
}
