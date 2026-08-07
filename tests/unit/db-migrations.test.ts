import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';

/**
 * A fresh database has every table the application queries.
 *
 * This is here because it was not true. `runMigrations` was called by nothing
 * outside the seed scripts, so a clean install following the README — `npm ci`,
 * `npm run build` — prerendered pages against a database with no tables in it
 * and the build failed. It was invisible to everyone working on the project,
 * because their database had been seeded once, long ago, by a script that
 * happened to migrate.
 *
 * `getDb()` now migrates when it first opens the connection. What this test
 * pins is the property that mattered: a database created from the committed
 * migrations, and nothing else, can answer every query the site makes.
 */

const MIGRATIONS = path.resolve(__dirname, '../../lib/db/migrations');

/** Every table the application reads or writes at runtime. */
const TABLES = [
  'schedule_uploads',
  'flight_entries',
  'news_posts',
  'feedback_submissions',
  'documents',
];

describe('a database built from the committed migrations', () => {
  it('has every table the application queries', () => {
    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });

    const present = sqlite
      .prepare(`select name from sqlite_master where type = 'table'`)
      .all()
      .map((row) => (row as { name: string }).name);

    expect(TABLES.filter((table) => !present.includes(table))).toEqual([]);
  });

  it('can be migrated twice without complaint', () => {
    // What every restart after the first one does.
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder: MIGRATIONS });
    expect(() => migrate(db, { migrationsFolder: MIGRATIONS })).not.toThrow();
  });
});
