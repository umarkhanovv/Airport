import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { assertDataDirIsPersistent, env } from '../env.ts';

import { runMigrations } from './migrate.ts';
import * as schema from './schema.ts';

export * from './schema.ts';

/**
 * SQLite connection (decision #2).
 *
 * One process, one file on local disk, no server to administer. The airport's
 * IT team can back the whole database up by copying a single file.
 */

let instance: ReturnType<typeof createDatabase> | null = null;

function createDatabase(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);

  // WAL lets the board keep serving reads while an upload is being written.
  sqlite.pragma('journal_mode = WAL');
  // Without this, SQLite silently ignores the ON DELETE CASCADE above.
  sqlite.pragma('foreign_keys = ON');
  // Wait rather than immediately failing if an upload holds the write lock.
  sqlite.pragma('busy_timeout = 5000');

  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!instance) {
    // Fails loudly if DATA_DIR would put the database inside .next, where the
    // next deploy would delete it.
    assertDataDirIsPersistent();
    instance = createDatabase(env.paths.database);

    // Once, when the connection is first opened. Drizzle records what it has
    // applied, so this is a no-op on every start after the first — and it is
    // what makes "deploying is git pull, npm ci, npm run build, restart" true
    // rather than "…and remember to migrate first, or the build fails".
    runMigrations(instance);
  }
  return instance;
}

/** For tests and scripts that need an isolated database. */
export function createTestDb(file = ':memory:') {
  return createDatabase(file);
}
