import { defaultCache } from '@serwist/next/worker';
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

/**
 * Service worker (plan Stage 9, decision #7, spec §17.4).
 *
 * The one feature that matters here is the offline flight board: someone
 * standing in the terminal on a bad connection should still see the schedule
 * they loaded earlier. The board already renders its own "Расписание
 * загружено: …" line, so a cached page carries a truthful as-of date with it —
 * the date is part of the document, not something the worker has to synthesise.
 *
 * Serwist rather than a hand-rolled worker (decision #7): precache manifests,
 * stale-while-revalidate and the update lifecycle are where service-worker bugs
 * live, and a bug here persists on a visitor's device until they unregister it,
 * which no ordinary user knows how to do.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

/**
 * Typed as `WorkerGlobalScope` rather than `ServiceWorkerGlobalScope`, which
 * only exists in TypeScript's `webworker` lib — and adding that to the project
 * tsconfig collides with the DOM lib every other file needs. The build injects
 * the manifest into this global; nothing else here needs the wider type.
 */
declare const self: WorkerGlobalScope;

/**
 * Never cached, under any strategy.
 *
 * Admin is the important one: caching a page from the panel leaves the
 * airport's schedule management sitting in the browser of whoever uses that
 * machine next (plan §9.1). The others are simply pointless to cache — a
 * one-off download, a weather reading that is stale within minutes, and a
 * form endpoint that must always reach the server.
 */
const NEVER_CACHE = /^\/(admin|api\/(schedule\/download|weather))(\/|$)/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,

  // Take over immediately rather than waiting for every tab to close. A
  // schedule correction should reach people on the next load, not eventually.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,

  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && NEVER_CACHE.test(url.pathname),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],

  fallbacks: {
    entries: [
      {
        url: '/offline',
        // Only reached when the page was never cached. A board that has been
        // visited comes back from the pages cache with its own as-of date.
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
