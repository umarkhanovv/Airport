import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/** Throwaway state directory, so tests never touch the developer's database. */
const E2E_DATA_DIR = '.e2e-data';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'html',

  use: {
    baseURL,
    trace: 'on-first-retry',

    /**
     * Every test browser asks for less motion — a preference the site honours
     * in `app/globals.css`, and one this suite needs.
     *
     * `html { scroll-behavior: smooth }` animates every scroll, including the
     * one the driver performs to reach a control below the fold. That scroll is
     * asynchronous and unacknowledged: the browser returns from it immediately
     * and the element arrives some frames later, so a click can be aimed at
     * where the element no longer is. It cost the news pagination test — whose
     * link sits ~1000 px down a list of ten stories — a flake roughly one run
     * in ten, and it would have cost the next below-the-fold control too.
     *
     * Turning it off here rather than waiting it out in each test keeps the
     * cause fixed rather than the symptom, and the browser stays a real one:
     * this is the rendering a visitor who has asked for less motion gets, and
     * `tests/e2e/accessibility.spec.ts` pins both halves of that so the
     * stylesheet cannot quietly stop honouring the preference.
     */
    contextOptions: { reducedMotion: 'reduce' },
  },

  projects: [
    /**
     * Signs in once and stores the session. Specs that exercise the admin
     * panel reuse it rather than each logging in, which would trip the login
     * rate limiter — see tests/e2e/auth.setup.ts.
     */
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  /**
   * Tests run against the real standalone bundle under plain `node server.js`
   * — byte for byte the command the airport will use in production. This is
   * what keeps "no Vercel lock-in" honest (plan §9.4); a dev-server-only suite
   * would never catch a platform-specific regression, and `next start` does
   * not even exercise the standalone output.
   *
   * `e2e:seed` imports the sample workbook into a throwaway DATA_DIR, so the
   * board has real data to render and the developer's own database is never
   * touched.
   */
  webServer: {
    command: 'npm run e2e:seed && npm run build && npm start',
    env: {
      PORT: String(PORT),
      DATA_DIR: E2E_DATA_DIR,
      /**
       * Throwaway admin credentials for the Stage 6 panel tests. Real secrets
       * never live in the repo; these exist only so the login flow has
       * something to authenticate against on a disposable database.
       */
      ADMIN_PASSWORD: 'e2e-admin-password',
      SESSION_SECRET: 'e2e-session-secret-not-for-production',
      /**
       * The airport's server will run in UTC while the airport is UTC+5. Every
       * e2e run therefore exercises the case where the server's calendar and
       * the airport's disagree — the bug plan §4 rule 2 exists to prevent.
       */
      TZ: 'UTC',
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
