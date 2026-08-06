/**
 * Deterministic news fixture for the e2e suite.
 *
 * The real seeder scrapes hsairport.kz, which is exactly what CI must not do:
 * a test run should not depend on someone else's server being up, and its
 * results should not change when the airport publishes something.
 *
 * So this writes a small, fixed set covering the cases the tests care about —
 * a story in all three languages, single-language stories, and an unpublished
 * draft that must never appear on the public site.
 */
import crypto from 'node:crypto';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '../lib/db/schema.ts';
import { newsPosts } from '../lib/db/schema.ts';
import { env } from '../lib/env.ts';

const trilingual = crypto.randomUUID();

const rows: (typeof newsPosts.$inferInsert)[] = [
  {
    id: crypto.randomUUID(),
    slug: 'novyi-reis-turkestan-samarkand',
    locale: 'ru',
    translationGroupId: trilingual,
    title: 'Новый рейс Туркестан — Самарканд',
    excerpt: 'Рейс будет выполняться дважды в неделю.',
    body: 'Рейс будет выполняться дважды в неделю.\n\nПодробное расписание доступно на табло.',
    publishedAt: '2025-05-01T09:00:00.000Z',
    isPublished: true,
    legacyUrl: 'https://hsairport.kz/fixture-samarkand/',
  },
  {
    id: crypto.randomUUID(),
    slug: 'new-route-turkistan-samarkand',
    locale: 'en',
    translationGroupId: trilingual,
    title: 'New route: Turkistan — Samarkand',
    excerpt: 'The route will operate twice a week.',
    body: 'The route will operate twice a week.\n\nThe full schedule is on the flight board.',
    publishedAt: '2025-05-01T09:00:00.000Z',
    isPublished: true,
    legacyUrl: 'https://hsairport.kz/en/fixture-samarkand/',
  },
  {
    id: crypto.randomUUID(),
    slug: 'turkistan-samarqand-zhanga-reisi',
    locale: 'kk',
    translationGroupId: trilingual,
    title: 'Түркістан — Самарқанд жаңа рейсі',
    excerpt: 'Рейс аптасына екі рет орындалады.',
    body: 'Рейс аптасына екі рет орындалады.\n\nТолық кесте рейстер тақтасында.',
    publishedAt: '2025-05-01T09:00:00.000Z',
    isPublished: true,
    legacyUrl: 'https://hsairport.kz/kz/fixture-samarkand/',
  },
  // Russian only — the common case, and the reason the UI must not imply a
  // translation exists.
  {
    id: crypto.randomUUID(),
    slug: 'aeroport-poluchil-sertifikat',
    locale: 'ru',
    translationGroupId: crypto.randomUUID(),
    title: 'Аэропорт получил сертификат годности',
    excerpt: 'Сертификат подтверждает соответствие требованиям.',
    body: 'Сертификат подтверждает соответствие требованиям.',
    publishedAt: '2025-03-10T09:00:00.000Z',
    isPublished: true,
    legacyUrl: 'https://hsairport.kz/fixture-certificate/',
  },
  // Must never be visible to the public.
  {
    id: crypto.randomUUID(),
    slug: 'chernovik-ne-dlya-publikatsii',
    locale: 'ru',
    translationGroupId: crypto.randomUUID(),
    title: 'ЧЕРНОВИК не для публикации',
    excerpt: null,
    body: 'Этот текст не должен быть виден на сайте.',
    publishedAt: '2025-06-01T09:00:00.000Z',
    isPublished: false,
    legacyUrl: null,
  },
];

// Enough to exercise pagination without making the fixture unreadable.
for (let i = 1; i <= 12; i += 1) {
  rows.push({
    id: crypto.randomUUID(),
    slug: `arhivnaya-novost-${i}`,
    locale: 'ru',
    translationGroupId: crypto.randomUUID(),
    title: `Архивная новость ${i}`,
    excerpt: `Краткое описание ${i}.`,
    body: `Текст архивной новости ${i}.`,
    publishedAt: `2024-0${((i % 9) + 1).toString()}-01T09:00:00.000Z`,
    isPublished: true,
    legacyUrl: null,
  });
}

const sqlite = new Database(env.paths.database);
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });

db.transaction((tx) => {
  tx.delete(newsPosts).run();
  tx.insert(newsPosts).values(rows).run();
});

sqlite.close();
console.log(
  `Seeded ${rows.length} fixture posts (${rows.filter((r) => r.isPublished).length} published) into ${env.paths.database}`
);
