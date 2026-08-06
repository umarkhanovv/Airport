import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Automated enforcement of the project's hard constraints (plan Appendix B).
 *
 * These are stated as prose in the spec, which means they erode silently.
 * Encoding them as tests makes violations a build failure instead of a
 * code-review question.
 */

const ROOT = path.resolve(__dirname, '../..');

/** Source files we control — excludes dependencies and build output. */
function sourceFiles(): string[] {
  const out = execFileSync(
    'find',
    [
      ROOT,
      '-type',
      'f',
      '(',
      '-name',
      '*.ts',
      '-o',
      '-name',
      '*.tsx',
      '-o',
      '-name',
      '*.mjs',
      '-o',
      '-name',
      '*.json',
      ')',
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      '*/.next/*',
      '-not',
      '-path',
      '*/.git/*',
    ],
    { encoding: 'utf8' }
  );
  return out.split('\n').filter(Boolean);
}

const files = sourceFiles();

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

describe('no Vercel lock-in', () => {
  it('never opts a route into the Edge runtime', () => {
    const offenders = files
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /runtime\s*=\s*['"]edge['"]/.test(read(f)));

    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('does not depend on any Vercel-hosted service package', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

    const forbidden = deps.filter((d) => /^@vercel\/(kv|postgres|blob|edge-config)/.test(d));
    expect(forbidden).toEqual([]);
  });

  it('builds a standalone server bundle', () => {
    expect(read(path.join(ROOT, 'next.config.ts'))).toMatch(/output:\s*'standalone'/);
  });
});

describe('no accounts anywhere', () => {
  it('does not depend on an auth framework with user records', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

    const forbidden = deps.filter((d) =>
      /^(next-auth|@auth\/|@clerk\/|@supabase\/auth|lucia-auth|passport)/.test(d)
    );
    expect(forbidden).toEqual([]);
  });
});

describe('environment', () => {
  it('marks every optional variable as optional in .env.example', () => {
    const example = read(path.join(ROOT, '.env.example'));
    for (const optional of ['DATA_DIR', 'AIRPORT_TZ', 'WEATHER_ENABLED', 'SMTP_HOST']) {
      expect(example, `${optional} should be commented out`).toMatch(
        new RegExp(`^#\\s*${optional}=`, 'm')
      );
    }
  });

  it('documents every variable the code actually reads', () => {
    const envSource = read(path.join(ROOT, 'lib/env.ts'));
    const example = read(path.join(ROOT, '.env.example'));

    const referenced = [...envSource.matchAll(/read(?:Optional|Boolean)\('([A-Z0-9_]+)'/g)].map(
      (m) => m[1]
    );

    for (const name of new Set(referenced)) {
      expect(example, `${name} is read by lib/env.ts but absent from .env.example`).toContain(name);
    }
  });

  it('never exposes a secret through a NEXT_PUBLIC_ variable', () => {
    const secretish = /NEXT_PUBLIC_[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY|SMTP)/;
    const offenders = files.filter((f) => secretish.test(read(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe('data directory', () => {
  it('keeps the sample workbook out of the gitignore', () => {
    const ignore = read(path.join(ROOT, '.gitignore'));
    // The runtime artefacts are ignored...
    expect(ignore).toMatch(/^\/data\/uploads\//m);
    expect(ignore).toMatch(/^\/data\/app\.db$/m);
    // ...but not the whole directory, which holds the committed sample file.
    expect(ignore).not.toMatch(/^\/data\/?$/m);
  });

  it('still has the sample workbook the parser is built against', () => {
    expect(fs.existsSync(path.join(ROOT, 'data/sample_weekly_schedule.xlsx'))).toBe(true);
  });
});
