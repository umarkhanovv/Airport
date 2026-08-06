/**
 * Imports a weekly schedule workbook from the command line.
 *
 *   npm run schedule:import -- data/sample_weekly_schedule.xlsx
 *   npm run schedule:import -- path/to/week.xlsx --dry-run
 *
 * This is the same parse → validate → publish path the admin panel will use in
 * Stage 6, exercised without a UI. `--dry-run` prints the preview and writes
 * nothing, which is exactly what the admin preview screen shows before the
 * staff member confirms (spec §8).
 *
 * Runs under plain Node with native TypeScript stripping; no build step.
 */
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '../lib/db/schema.ts';
import { env } from '../lib/env.ts';
import { parseScheduleWorkbook } from '../lib/flights/index.ts';
import { publishSchedule, sha256 } from '../lib/flights/import.ts';
import type { Diagnostic } from '../lib/flights/types.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('Usage: npm run schedule:import -- <file.xlsx> [--dry-run]');
  process.exit(1);
}

const absolute = path.resolve(process.cwd(), file);
if (!fs.existsSync(absolute)) {
  console.error(`No such file: ${absolute}`);
  process.exit(1);
}

const buffer = fs.readFileSync(absolute);
const parsed = parseScheduleWorkbook(buffer);

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------
console.log(`\nFile      ${path.basename(absolute)}  (${(buffer.length / 1024).toFixed(0)} KB)`);
console.log(`Sheet     ${parsed.sheetName ?? '—'}`);
console.log(`Week      ${parsed.weekStart ?? '—'} … ${parsed.weekEnd ?? '—'}`);
console.log(`Days      ${parsed.days.length}`);
console.log(`Flights   ${parsed.entries.length}`);

if (parsed.days.length > 0) {
  console.log('\n  date         arrivals  departures');
  for (const day of parsed.days) {
    console.log(
      `  ${day.date}   ${String(day.arrivals).padStart(6)}  ${String(day.departures).padStart(10)}`
    );
  }
}

const show = (list: Diagnostic[], label: string) => {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length}):`);
  for (const d of list) {
    const where = d.row ? `row ${d.row}` : 'file';
    console.log(`  [${where}] ${d.code}: ${d.message}`);
  }
};

show(
  parsed.diagnostics.filter((d) => d.severity === 'error'),
  'ERRORS'
);
show(
  parsed.diagnostics.filter((d) => d.severity === 'warning'),
  'WARNINGS'
);

if (!parsed.ok) {
  console.error('\nRefusing to publish: the file has errors. Nothing was written.\n');
  process.exit(2);
}

if (dryRun) {
  console.log('\nDry run — nothing written.\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------
fs.mkdirSync(env.paths.scheduleUploads, { recursive: true });

const storedName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.xlsx`;
const storedAbsolute = path.join(env.paths.scheduleUploads, storedName);

// The original workbook is written before the transaction and kept for the
// public "download the detailed schedule" link (spec §6.4). The stored name is
// generated — the uploaded filename is never used as a path.
fs.writeFileSync(storedAbsolute, buffer);

fs.mkdirSync(path.dirname(env.paths.database), { recursive: true });
const sqlite = new Database(env.paths.database);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });

const outcome = publishSchedule(db, parsed, {
  originalFilename: path.basename(absolute),
  storedPath: path.relative(env.paths.dataDir, storedAbsolute),
  sha256: sha256(buffer),
});

sqlite.close();

console.log(`\nPublished ${outcome.entryCount} flights as upload ${outcome.uploadId}`);
console.log(`Database  ${env.paths.database}`);
console.log(`Workbook  ${storedAbsolute}\n`);
