/**
 * Is this machine configured to serve the site?
 *
 * `lib/env.ts` has had `assertRuntimeEnv()` since Stage 0 and nothing ever
 * called it, so the check it performs was real and unreachable. Without it a
 * misconfigured server starts perfectly happily and then fails at the first
 * thing that needs a secret — an administrator trying to sign in, which is
 * both the worst moment to discover it and the hardest to attribute.
 *
 * Deliberately a separate command rather than something the server runs at
 * import time: the build must stay secret-free, and CI builds this repository
 * without any of these values set.
 *
 *   npm run check:env
 */
import { assertRuntimeEnv } from '../lib/env.ts';

try {
  assertRuntimeEnv();
  console.log('Environment looks ready: ADMIN_PASSWORD, SESSION_SECRET and SITE_URL are all set.');
} catch (error) {
  // The message from `assertRuntimeEnv` names every missing variable at once,
  // so an operator fixes them in one pass rather than one restart at a time.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
