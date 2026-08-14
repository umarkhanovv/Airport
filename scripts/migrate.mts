/**
 * Applies pending migrations, once, from a single process.
 *
 *   npm run db:migrate
 *
 * Run by `npm run build` before `next build`, and that ordering is the whole
 * point of the file.
 *
 * ---------------------------------------------------------------------------
 * Why the build cannot leave this to `getDb()`
 * ---------------------------------------------------------------------------
 * `getDb()` migrates on first use (lib/db/index.ts), which is what makes a
 * fresh clone build at all — prerendering reads the database, so something has
 * to create the tables. That works when one process does it. `next build`
 * spawns one prerender worker per core, they open the same cold database at the
 * same moment, and drizzle's migrator is not safe against that:
 *
 *     session.run(CREATE TABLE IF NOT EXISTS __drizzle_migrations)
 *     session.all(SELECT … ORDER BY created_at DESC LIMIT 1)   ← outside any transaction
 *     session.run(BEGIN)
 *       CREATE TABLE `flight_entries` …
 *
 * (drizzle-orm/sqlite-core/dialect.cjs). The read of what has already been
 * applied happens *before* the transaction opens. Two workers both read "none
 * applied"; the first creates the tables and commits; the second waits out the
 * write lock, proceeds on its stale answer, and dies on
 * `table 'flight_entries' already exists`, taking the build with it.
 *
 * It needs real parallelism to lose the race, so it passed on a ten-core laptop
 * and failed on a twenty-eight-core build machine — visible only in a deploy
 * log. Migrating first removes the race rather than narrowing it: with every
 * migration already recorded, the workers read the journal, find nothing
 * pending, and never open the transaction at all.
 */
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '../lib/db/schema.ts';
import { assertDataDirIsPersistent, env } from '../lib/env.ts';

assertDataDirIsPersistent();

fs.mkdirSync(path.dirname(env.paths.database), { recursive: true });

const sqlite = new Database(env.paths.database);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });

const tables = sqlite
  .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")
  .get() as { n: number };

sqlite.close();

console.log(`migrated ${env.paths.database} (${tables.n} tables)`);
