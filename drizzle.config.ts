import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are plain .sql files committed to the repository, so the airport's
 * IT team can read and audit exactly what will run against their database
 * (decision #2). drizzle-kit only generates them; it is a devDependency and is
 * never needed at runtime.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: process.env.DATA_DIR ? `${process.env.DATA_DIR}/app.db` : './data/app.db',
  },
  strict: true,
});
