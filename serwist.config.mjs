import crypto from 'node:crypto';
import fs from 'node:fs';

import { serwist } from '@serwist/next/config';

/**
 * A revision that changes when the build does.
 *
 * Next writes its build id to `.next/BUILD_ID`; falling back to a random value
 * only matters if this ever runs before a build, in which case a fresh
 * revision is the safe answer.
 */
const buildRevision = fs.existsSync('.next/BUILD_ID')
  ? fs.readFileSync('.next/BUILD_ID', 'utf8').trim()
  : crypto.randomUUID();

/**
 * Service worker build configuration (plan Stage 9, decision #7).
 *
 * Configurator mode rather than the `withSerwist` Next plugin: that plugin is a
 * webpack plugin, and this project builds with Turbopack, so it silently
 * produced no service worker at all — the build went green and `public/sw.js`
 * was never written. Here the worker is a separate, explicit step in the build
 * script, which also means it cannot fail quietly.
 *
 * Run by `npm run build`, between `next build` (which produces the assets the
 * precache manifest lists) and `prepare-standalone` (which copies `public/`
 * into the standalone bundle, and so must see the finished worker).
 */
export default serwist.withNextConfig(() => ({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',

  /**
   * Precache the shell only — stylesheet, fonts, icons, offline page.
   *
   * Precaching every prerendered route and every JS chunk came to 196 URLs and
   * 7.7 MB, downloaded on first visit. That is the wrong trade for an audience
   * on airport wifi and mid-range Android: it spends the visitor's data before
   * they have asked for anything, against the budget in plan §9.2.
   *
   * The offline requirement (spec §17.4) does not need it either. Runtime
   * caching stores each page as it is visited, so someone who has opened the
   * flight board has the board — with the "schedule loaded on …" date it was
   * rendered with — and someone who never opened it has nothing to show
   * offline anyway.
   */
  precachePrerendered: false,

  globDirectory: '.',
  globPatterns: ['.next/static/**/*.css', 'public/fonts/*.woff2', 'public/icons/*.png'],

  /**
   * The offline fallback has to be precached by name.
   *
   * It is the one page that must be available before it has ever been visited
   * — by definition nobody browses to it on purpose — so it cannot rely on
   * runtime caching like every other route. The revision is the build id, so a
   * deploy replaces it rather than serving the previous copy forever.
   */
  additionalPrecacheEntries: [{ url: '/offline', revision: buildRevision }],

  // The Kazakh subset is the largest font file and the one that must not fall
  // back to a system face (plan §6.3), so the ceiling is raised past it.
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
}));
