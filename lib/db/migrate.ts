import 'server-only';

import path from 'node:path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { FlightsDb } from '../flights/import.ts';

/**
 * Applies any pending migrations from `lib/db/migrations`.
 *
 * Called explicitly by scripts and by the admin entry points rather than at
 * import time — a migration is a write, and writes should never be a
 * side-effect of loading a module.
 */
export function runMigrations(db: FlightsDb) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });
}
