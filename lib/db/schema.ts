import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Database schema (plan §3.3).
 *
 * Exactly three domains live in the database: flights, news and feedback.
 * Everything else — static pages, UI strings, the city dictionary — is a file
 * in the repository (plan §3.2). Do not blur that boundary.
 *
 * There is no `users` table, no `sessions` table and no `accounts` table, and
 * there never will be. Admin access is a single environment-variable password
 * (spec §8, §14).
 */

/** One uploaded weekly workbook. The original file is kept for download. */
export const scheduleUploads = sqliteTable('schedule_uploads', {
  id: text('id').primaryKey(),
  /** As the staff member named it — display only, never used as a path. */
  originalFilename: text('original_filename').notNull(),
  /** Generated filename on disk, relative to DATA_DIR. */
  storedPath: text('stored_path').notNull(),
  sha256: text('sha256').notNull(),
  uploadedAt: text('uploaded_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  weekStart: text('week_start'),
  weekEnd: text('week_end'),
  entryCount: integer('entry_count').notNull().default(0),
  /** JSON array of diagnostics, replayed in the admin UI. */
  warnings: text('warnings').notNull().default('[]'),
  /** Exactly one upload is active; it is the one the public board reads. */
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
});

export const flightEntries = sqliteTable(
  'flight_entries',
  {
    id: text('id').primaryKey(),
    uploadId: text('upload_id')
      .notNull()
      .references(() => scheduleUploads.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['arrival', 'departure'] }).notNull(),
    /** `YYYY-MM-DD`, airport-local. */
    date: text('date').notNull(),
    flightNo: text('flight_no').notNull(),
    flightNoNorm: text('flight_no_norm').notNull(),
    cityRaw: text('city_raw').notNull(),
    cityKey: text('city_key').notNull(),
    /**
     * `HH:MM` TEXT, deliberately not a timestamp. Storing this as an instant
     * is how a UTC server ends up showing the whole board five hours out
     * (plan §4 rule 1). Zero-padded, so lexical sort is chronological sort.
     */
    scheduledTime: text('scheduled_time'),
    /** NULL means unknown. Never inferred. */
    intl: integer('intl', { mode: 'boolean' }),
    aircraft: text('aircraft'),
    /** Links the two halves of one aircraft rotation. */
    turnaroundKey: text('turnaround_key').notNull(),
    /** Spreadsheet row this came from, for tracing a complaint back to the file. */
    sourceRow: integer('source_row').notNull(),
  },
  (table) => [
    uniqueIndex('flight_entries_natural_key').on(
      table.uploadId,
      table.date,
      table.kind,
      table.flightNoNorm,
      table.scheduledTime
    ),
    // The board's main query: one day, one direction, ordered by time.
    index('flight_entries_date_kind').on(table.date, table.kind, table.scheduledTime),
    // Flight-number search (§17.1).
    index('flight_entries_flight_no').on(table.flightNoNorm),
    index('flight_entries_upload').on(table.uploadId),
  ]
);

/**
 * News posts (spec §7).
 *
 * One row per locale, as the spec specifies — the airport publishes some
 * stories in one language and others in three, so a single row with optional
 * translation columns would be mostly empty.
 *
 * `translationGroupId` links the versions of one story. Without it there is no
 * way to offer "read this in Kazakh", and no way for the admin to see what is
 * untranslated — which matters here: of the 27 legacy posts, 17 are Russian,
 * 7 Kazakh and 3 English, with only two stories present in all three
 * (plan §1.5).
 */
export const newsPosts = sqliteTable(
  'news_posts',
  {
    id: text('id').primaryKey(),
    /** Generated from the title; the legacy percent-encoded slugs are dropped. */
    slug: text('slug').notNull(),
    locale: text('locale', { enum: ['ru', 'en', 'kk'] }).notNull(),
    /** Shared by every language version of the same story. */
    translationGroupId: text('translation_group_id').notNull(),

    title: text('title').notNull(),
    excerpt: text('excerpt'),
    /** Markdown. Authored in the admin panel (Stage 6). */
    body: text('body').notNull(),

    /** Filename under DATA_DIR/uploads/news — never a path, never a URL. */
    coverImage: text('cover_image'),
    coverAlt: text('cover_alt'),

    publishedAt: text('published_at').notNull(),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),

    /** Original URL on hsairport.kz, so redirects stay possible. */
    legacyUrl: text('legacy_url'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex('news_posts_slug_locale').on(table.slug, table.locale),
    // The list query: published posts for one locale, newest first.
    index('news_posts_locale_published').on(table.locale, table.isPublished, table.publishedAt),
    index('news_posts_translation_group').on(table.translationGroupId),
  ]
);

/** The locales a news post can be written in — same set as the site's. */
export type NewsLocale = 'ru' | 'en' | 'kk';

export type NewsPost = typeof newsPosts.$inferSelect;
export type NewNewsPost = typeof newsPosts.$inferInsert;

export type ScheduleUpload = typeof scheduleUploads.$inferSelect;
export type NewScheduleUpload = typeof scheduleUploads.$inferInsert;
export type FlightEntryRow = typeof flightEntries.$inferSelect;
export type NewFlightEntryRow = typeof flightEntries.$inferInsert;
