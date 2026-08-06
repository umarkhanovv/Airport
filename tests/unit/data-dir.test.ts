import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDataDir } from '@/lib/env';

/**
 * DATA_DIR must never resolve inside the build output (plan §3.4).
 *
 * With `output: 'standalone'`, Next's generated server runs
 * `process.chdir(__dirname)` before application code loads. A relative
 * DATA_DIR — including the default `./data` — then resolves to
 * `.next/standalone/data`, and the next deploy's `rm -rf .next` destroys the
 * database and every uploaded schedule.
 *
 * This was found in Stage 3 when the e2e server started with an empty
 * database. These tests exist so it cannot come back.
 */

const PROJECT = '/srv/airport';
const STANDALONE = path.join(PROJECT, '.next', 'standalone');

describe('resolveDataDir', () => {
  it('unwinds the standalone chdir so data lands beside the project', () => {
    expect(resolveDataDir('./data', STANDALONE)).toBe(path.join(PROJECT, 'data'));
    expect(resolveDataDir('data', STANDALONE)).toBe(path.join(PROJECT, 'data'));
    expect(resolveDataDir('.e2e-data', STANDALONE)).toBe(path.join(PROJECT, '.e2e-data'));
  });

  it('never resolves inside the build output', () => {
    for (const raw of ['./data', 'data', '.e2e-data', './var/state']) {
      const resolved = resolveDataDir(raw, STANDALONE);
      expect(resolved.split(path.sep), `${raw} must stay outside .next`).not.toContain('.next');
    }
  });

  it('leaves an absolute path exactly as given', () => {
    // The recommended production configuration.
    expect(resolveDataDir('/var/lib/hsairport', STANDALONE)).toBe('/var/lib/hsairport');
    expect(resolveDataDir('/var/lib/hsairport', PROJECT)).toBe('/var/lib/hsairport');
  });

  it('behaves normally when not running standalone', () => {
    expect(resolveDataDir('./data', PROJECT)).toBe(path.join(PROJECT, 'data'));
    expect(resolveDataDir('./data', '/home/dev/app')).toBe('/home/dev/app/data');
  });

  it('only unwinds when the path really ends in .next/standalone', () => {
    // A project that merely has "standalone" in its name must not be rewritten.
    const lookalike = '/srv/standalone';
    expect(resolveDataDir('./data', lookalike)).toBe(path.join(lookalike, 'data'));

    const nested = '/srv/app/.next/standalone/sub';
    expect(resolveDataDir('./data', nested)).toBe(path.join(nested, 'data'));
  });
});
