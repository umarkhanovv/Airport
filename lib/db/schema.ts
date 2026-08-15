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
 * What staff changed on top of the uploaded workbook.
 *
 * A patch layer, and it has to be one. `flight_entries` rows belong to a
 * `schedule_uploads` row and are destroyed with it; `publishSchedule` writes an
 * entirely fresh set on every upload. A correction stored on a flight row would
 * therefore vanish the moment anyone re-published that week, silently, which is
 * the worst way for a correction to disappear. Keeping edits in their own table
 * also leaves "make an earlier week live again" working, which any design that
 * made `flight_entries` the editable record would have broken.
 *
 * So the workbook stays the record of what flights exist, and this holds what
 * a human said about them. Three kinds of row live here:
 *
 *   - an override: some columns filled, layered onto the matching workbook row;
 *   - a tombstone (`isRemoved`): hide a workbook row that should not be flying;
 *   - an addition (`isAdded`): a flight no workbook contains at all.
 *
 * A NULL override column means "no opinion, use the workbook's value". That is
 * why every one of them is nullable and none has a default: the difference
 * between "staff cleared this field" and "staff never touched it" is a
 * difference the board depends on.
 *
 * `flightNoNorm` here is always the number as the *workbook* prints it, and it
 * never changes. Editing the displayed number writes `flightNo` only. If the
 * key could move, an edit would detach from its row on the next upload and
 * reappear as an orphan — which is precisely the failure this table exists to
 * prevent.
 */
export const flightEdits = sqliteTable(
  'flight_edits',
  {
    id: text('id').primaryKey(),
    /** `YYYY-MM-DD`, airport-local — same convention as `flight_entries`. */
    date: text('date').notNull(),
    kind: text('kind', { enum: ['arrival', 'departure'] }).notNull(),
    /** Identity within the day. Always the workbook's number. See above. */
    flightNoNorm: text('flight_no_norm').notNull(),

    /** A flight staff added, which no workbook contains. */
    isAdded: integer('is_added', { mode: 'boolean' }).notNull().default(false),
    /** A tombstone over a workbook row. Reversible; nothing is destroyed. */
    isRemoved: integer('is_removed', { mode: 'boolean' }).notNull().default(false),

    // Overrides. NULL means "use the workbook".
    flightNo: text('flight_no'),
    cityRaw: text('city_raw'),
    cityKey: text('city_key'),
    scheduledTime: text('scheduled_time'),
    intl: integer('intl', { mode: 'boolean' }),
    aircraft: text('aircraft'),

    /**
     * When it actually went, as staff observed it — `HH:MM`, wall clock, never
     * an instant, for exactly the reason `flight_entries.scheduledTime` is not
     * one. This is the only fact on the board the workbook cannot supply.
     */
    actualTime: text('actual_time'),
    /**
     * Which carrier is operating this, when it is not the one the flight number
     * names — a charter, a wet-lease, a codeshare flown on somebody else's
     * aircraft. Only staff can know that.
     *
     * An IATA designator, or the `AIRLINE_NONE` sentinel for "show no carrier".
     * NULL means nobody has said, and the flight number decides.
     */
    airline: text('airline'),
    /** A short free-text note shown beside the flight. */
    note: text('note'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One patch per flight per day, so saving twice updates rather than stacks.
    uniqueIndex('flight_edits_key').on(table.date, table.kind, table.flightNoNorm),
    // The board reads a date range; the admin screen reads one day.
    index('flight_edits_date').on(table.date),
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

/**
 * Feedback submissions (spec §9, plan §3.3).
 *
 * The database is the delivery mechanism, not a backup of one: with no SMTP
 * configured — which is the default, and may stay the default forever — a
 * submission stored here and read in the admin inbox *is* the feature. Email is
 * an optional notification layered on top.
 *
 * The sender's IP is stored hashed and never raw (plan §9.1). It exists to let
 * staff recognise a flood from one source, which a hash serves equally well,
 * and storing raw addresses would make this table a small pile of personal data
 * for no added benefit.
 */
export const feedbackSubmissions = sqliteTable(
  'feedback_submissions',
  {
    id: text('id').primaryKey(),

    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    subject: text('subject'),
    message: text('message').notNull(),

    /** Which language the form was filled in, so replies can match it. */
    locale: text('locale', { enum: ['ru', 'en', 'kk'] }).notNull(),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),

    /** SHA-256 of the sender's IP with a server-side secret. Never the address. */
    ipHash: text('ip_hash'),
  },
  (table) => [
    // The inbox: unread first, then newest.
    index('feedback_is_read_created').on(table.isRead, table.createdAt),
    index('feedback_created').on(table.createdAt),
  ]
);

/**
 * Files published alongside a content page — procurement notices, tariffs,
 * policies.
 *
 * These are in the database rather than in the repository because they change
 * constantly: the announcements page alone carried 188 of them on the legacy
 * site, most added and superseded within a month. Committing them would mean a
 * deploy every time a tender opens.
 *
 * A document belongs to a page by its content path — `press/announcements` —
 * and not to a locale. The files are Russian-language orders and protocols with
 * no translations; the page they hang under exists in all three languages and
 * lists the same documents on each.
 */
export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    /** Content page this is published on, e.g. `press/announcements`. */
    pagePath: text('page_path').notNull(),
    /** What the link says. Defaults to the uploaded filename, then edited. */
    title: text('title').notNull(),

    /** Generated filename under DATA_DIR/uploads/documents. Never a path. */
    storedName: text('stored_name').notNull(),
    /** As the uploader named it — shown, and used for the download filename. */
    originalFilename: text('original_filename').notNull(),
    sizeBytes: integer('size_bytes').notNull(),

    publishedAt: text('published_at').notNull(),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(true),

    /** Where it was on hsairport.kz, so migrated links stay traceable. */
    legacyUrl: text('legacy_url'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // The list query: one page's published documents, newest first.
    index('documents_page_published').on(table.pagePath, table.isPublished, table.publishedAt),
    uniqueIndex('documents_stored_name').on(table.storedName),
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

export type FlightEditRow = typeof flightEdits.$inferSelect;
export type NewFlightEditRow = typeof flightEdits.$inferInsert;

export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type NewFeedbackSubmission = typeof feedbackSubmissions.$inferInsert;

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;
