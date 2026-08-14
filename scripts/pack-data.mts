/**
 * Packs the runtime state into one archive, for seeding a host's volume.
 *
 *   npm run data:pack
 *
 * Produces `airport-data.tar.gz` containing the database and every uploaded
 * file. See docs/DEPLOY.md for the upload commands on the other end.
 *
 * ---------------------------------------------------------------------------
 * Why this is not `tar czf data.tgz data/`
 * ---------------------------------------------------------------------------
 * The database runs in WAL mode, so `app.db` on its own is not the database:
 * recent commits live in `app.db-wal` until a checkpoint folds them in. Right
 * now that file is larger than the database it belongs to. Copy `app.db` alone
 * from a running site and you get a snapshot silently missing the newest
 * schedule — exactly the data most worth having.
 *
 * `VACUUM INTO` writes a consistent, fully checkpointed copy without modifying
 * or locking out the original, so this is safe to run while the site is
 * serving. Copying all three files instead would also work, but only if they
 * are copied in the right order and nothing writes in between, which is a rule
 * nobody remembers at 2am.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { env } from '../lib/env.ts';

const OUTPUT = path.resolve(process.cwd(), 'airport-data.tar.gz');

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

if (!fs.existsSync(env.paths.database)) {
  console.error(`No database at ${env.paths.database}. Nothing to pack.`);
  process.exit(1);
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'airport-data-'));

try {
  // --- database -------------------------------------------------------------
  const snapshot = path.join(staging, 'app.db');
  const source = new Database(env.paths.database, { readonly: true });
  // Bind rather than interpolate: the staging path is generated, but a
  // filename is still not something to concatenate into SQL.
  source.prepare('VACUUM INTO ?').run(snapshot);
  source.close();

  const live = fs.statSync(env.paths.database).size;
  const wal = fs.existsSync(`${env.paths.database}-wal`)
    ? fs.statSync(`${env.paths.database}-wal`).size
    : 0;
  console.log(`database   ${kb(fs.statSync(snapshot).size)}  (live ${kb(live)} + WAL ${kb(wal)})`);

  // --- uploads --------------------------------------------------------------
  const uploads = path.join(env.paths.dataDir, 'uploads');
  let fileCount = 0;
  let byteCount = 0;

  if (fs.existsSync(uploads)) {
    fs.cpSync(uploads, path.join(staging, 'uploads'), { recursive: true });

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          fileCount += 1;
          byteCount += fs.statSync(full).size;
        }
      }
    };
    walk(uploads);
    console.log(`uploads    ${mb(byteCount)}  (${fileCount} files)`);
  } else {
    console.log('uploads    none');
  }

  // --- archive --------------------------------------------------------------
  fs.rmSync(OUTPUT, { force: true });
  /*
   * `-1`: the payload is PDFs and xlsx files, which are already compressed
   * containers. Level 9 spends minutes to save single-digit megabytes.
   */
  execFileSync('tar', ['-czf', OUTPUT, '-C', staging, '.'], {
    stdio: 'inherit',
    env: { ...process.env, GZIP: '-1' },
  });

  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT)}  (${mb(fs.statSync(OUTPUT).size)})`);
  console.log('Next: docs/DEPLOY.md § Seeding the volume\n');
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
