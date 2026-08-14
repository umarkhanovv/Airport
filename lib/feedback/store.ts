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

/**
 * How many submissions are marked read.
 *
 * Its own query rather than `listFeedback().length - countUnreadFeedback()`,
 * which is only right while the inbox is under fifty: the list is capped and
 * the unread count is not. The number ends up on the face of the "delete all
 * read" button, where it is the confirmation rather than a decoration, so it
 * has to be the number of rows that will actually go.
 */
export function countReadFeedback(): number {
  const rows = getDb()
    .select({ value: count() })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.isRead, true))
    .all();

  return rows[0]?.value ?? 0;
}

export function setFeedbackRead(id: string, isRead: boolean): void {
  getDb().update(feedbackSubmissions).set({ isRead }).where(eq(feedbackSubmissions.id, id)).run();
}

/** One submission, for the delete confirmation to check what it was told. */
export function getFeedback(id: string): FeedbackSubmission | null {
  const rows = getDb()
    .select()
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.id, id))
    .limit(1)
    .all();

  return rows[0] ?? null;
}

/**
 * Removes one submission.
 *
 * Irreversible, and there is no trash: this row is the whole delivery path
 * when no SMTP is configured, which is the default. So the form in front of
 * this asks for the sender's name to be typed back — the same shape as
 * deleting a post or a schedule, and for a better reason than either, because
 * what is being destroyed was written by a member of the public who has no
 * copy of it.
 */
export function deleteFeedback(id: string): void {
  getDb().delete(feedbackSubmissions).where(eq(feedbackSubmissions.id, id)).run();
}

/**
 * Removes every submission already marked read, and says how many.
 *
 * The inbox fills with spam faster than with correspondence, and clearing it
 * one typed name at a time is the kind of chore that ends with staff not
 * opening the inbox. Marking read is the deliberate act here: nothing is
 * deleted that somebody has not already looked at and dismissed.
 */
export function deleteReadFeedback(): number {
  return getDb().delete(feedbackSubmissions).where(eq(feedbackSubmissions.isRead, true)).run()
    .changes;
}
