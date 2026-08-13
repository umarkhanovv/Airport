import 'server-only';

import path from 'node:path';

/**
 * Environment configuration.
 *
 * Two rules govern this file (plan §13):
 *
 * 1. **Every optional variable is genuinely optional.** `next build` and
 *    `next start` must succeed with all of them unset. Nothing here throws at
 *    import time.
 * 2. **Secrets are validated at the point of use, not at import.** If
 *    `ADMIN_PASSWORD` threw on import, the build would need production secrets
 *    just to compile — a self-hosting footgun. Instead the accessors below
 *    throw a readable error the first time they are actually needed.
 */

function readOptional(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readOptional(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw);
}

class MissingEnvError extends Error {
  constructor(name: string, purpose: string) {
    super(
      `Missing required environment variable ${name}.\n` +
        `Purpose: ${purpose}\n` +
        `Set it in your .env file or in the process environment. See .env.example.`
    );
    this.name = 'MissingEnvError';
  }
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

/**
 * Resolves DATA_DIR to an absolute path that survives a redeploy.
 *
 * This is not a formality. With `output: 'standalone'`, Next's generated
 * `server.js` runs `process.chdir(__dirname)` before any application code
 * loads, so `process.cwd()` is `.next/standalone`, not the project root. A
 * relative DATA_DIR — including the default `./data` — therefore resolves to
 * `.next/standalone/data`, and the next deploy's `rm -rf .next` silently
 * destroys the database and every uploaded schedule.
 *
 * Detected in Stage 3 when the e2e server came up with an empty database. The
 * board is the reason this site exists; losing its data on deploy would be the
 * worst possible failure, so the standalone chdir is unwound explicitly.
 *
 * Operators should still prefer an absolute DATA_DIR in production.
 */
export function resolveDataDir(raw: string, cwd: string = process.cwd()): string {
  if (path.isAbsolute(raw)) return raw;

  const standaloneSuffix = path.join('.next', 'standalone');
  const base = cwd.endsWith(standaloneSuffix) ? path.resolve(cwd, '..', '..') : cwd;

  return path.resolve(base, raw);
}

/**
 * Runtime state directory: the SQLite database and uploaded files.
 *
 * Defaults to `./data`, which also holds the committed sample workbook. Only
 * the generated artefacts inside it (`app.db`, `uploads/`) are gitignored.
 */
const dataDir = resolveDataDir(readOptional('DATA_DIR') ?? './data');

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  /** Canonical origin, used for sitemap, hreflang and absolute URLs. */
  siteUrl: readOptional('SITE_URL') ?? 'http://localhost:3000',

  /**
   * IANA timezone of the airport. Never derive "today" from the server clock —
   * a UTC server would roll the flight board over at 19:00 local (plan §4).
   */
  airportTz: readOptional('AIRPORT_TZ') ?? 'Asia/Almaty',

  /** Weather is a progressive enhancement and degrades silently (spec §11.2). */
  weatherEnabled: readBoolean('WEATHER_ENABLED', true),

  /**
   * This deployment is a preview, not the airport's site.
   *
   * A review copy carries the airport's name, logo, address and telephone
   * numbers, alongside content nobody has proofread — so the one thing it must
   * not do is turn up in a search for the airport. When set, `robots.txt`
   * disallows everything rather than only the admin tree.
   *
   * Off by default: the real deployment is the one that should be indexed, and
   * a flag that has to be remembered in order to be indexed would eventually be
   * forgotten.
   */
  isPreview: readBoolean('PREVIEW', false),

  paths: {
    dataDir,
    database: path.join(dataDir, 'app.db'),
    scheduleUploads: path.join(dataDir, 'uploads', 'schedules'),
    newsUploads: path.join(dataDir, 'uploads', 'news'),
    documentUploads: path.join(dataDir, 'uploads', 'documents'),
  },
} as const;

/**
 * Refuses a data directory inside the build output.
 *
 * Called at first database use rather than at import, so builds never need to
 * be environment-correct. Failing loudly here beats writing the airport's only
 * copy of its schedule somewhere the next deploy deletes.
 */
export function assertDataDirIsPersistent(dir: string = env.paths.dataDir): void {
  if (dir.split(path.sep).includes('.next')) {
    throw new Error(
      `DATA_DIR resolves inside the build output (${dir}).\n` +
        'Anything written there is destroyed on the next deploy. Set DATA_DIR ' +
        'to an absolute path outside the project, for example /var/lib/hsairport.'
    );
  }
}

/**
 * SMTP is entirely optional. When it is not configured, feedback submissions
 * are stored in the database and read in the admin inbox — which must work
 * with zero airport-provided configuration (spec §9).
 */
export function getSmtpConfig() {
  const host = readOptional('SMTP_HOST');
  const to = readOptional('SMTP_TO');
  if (!host || !to) return null;

  return {
    host,
    to,
    port: Number(readOptional('SMTP_PORT') ?? 587),
    user: readOptional('SMTP_USER'),
    pass: readOptional('SMTP_PASS'),
    from: readOptional('SMTP_FROM') ?? to,
  };
}

/** The sole admin credential. No accounts exist anywhere (spec §8, §14). */
export function getAdminPassword(): string {
  const value = readOptional('ADMIN_PASSWORD');
  if (!value) throw new MissingEnvError('ADMIN_PASSWORD', 'the single admin panel password');
  return value;
}

/** Secret used to sign the admin session cookie. */
export function getSessionSecret(): string {
  const value = readOptional('SESSION_SECRET');
  if (!value) throw new MissingEnvError('SESSION_SECRET', 'signing the admin session cookie');
  return value;
}

/**
 * Fail-fast check for a production deployment. Call this from a startup script
 * or health check — deliberately NOT at import time, so builds stay secret-free.
 */
export function assertRuntimeEnv(): void {
  const problems: string[] = [];
  for (const [name, check] of [
    ['ADMIN_PASSWORD', getAdminPassword],
    ['SESSION_SECRET', getSessionSecret],
  ] as const) {
    try {
      check();
    } catch {
      problems.push(name);
    }
  }
  if (!readOptional('SITE_URL')) problems.push('SITE_URL');

  if (problems.length > 0) {
    throw new Error(
      `Environment is not ready for production. Missing: ${problems.join(', ')}.\nSee .env.example.`
    );
  }
}
