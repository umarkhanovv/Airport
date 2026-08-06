import path from 'node:path';

/**
 * Where the shared admin session is stored.
 *
 * A plain module rather than an export from `auth.setup.ts`, because Playwright
 * refuses to let one test file import another — and both the setup and the
 * specs that reuse the session need this path.
 */
export const ADMIN_STORAGE_STATE = path.join(__dirname, '../../.auth/admin.json');

export const ADMIN_PASSWORD = 'e2e-admin-password';
