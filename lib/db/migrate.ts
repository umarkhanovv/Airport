import 'server-only';

import path from 'node:path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { FlightsDb } from '../flights/import.ts';

/**
 * Applies any pending migrations from `lib/db/migrations`.
 *
 * Called once by `getDb()`, when the connection is first opened — not at import
 * time, which would make a write the side-effect of loading a module.
 *
 * It was called by nothing at all until Stage 10, which meant a fresh install
 * following the README had no tables: `npm ci && npm run build` prerenders
 * pages that read the database, and the first one crashed the build. Only the
 * seed scripts migrated, so the failure was invisible to anyone whose database
 * had ever been seeded — which is everyone who had worked on it.
 */
export function runMigrations(db: FlightsDb) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });
}
