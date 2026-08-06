import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
      // `server-only` throws by design outside a React Server Component. That
      // marker is exactly what we want in the app, but it would stop Vitest
      // from importing the parser at all, so it resolves to the package's own
      // no-op build under test. The guard is still enforced for real builds,
      // and separately asserted in tests/unit/hard-constraints.test.ts.
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    // Playwright owns tests/e2e; Vitest must not try to run them.
    include: ['tests/unit/**/*.test.ts'],
  },
});
