'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker (plan Stage 9, decision #7).
 *
 * The Next plugin would do this on its own, but this project builds the worker
 * through the Serwist CLI instead — the plugin is a webpack plugin and produced
 * nothing at all under Turbopack — so registration is explicit.
 *
 * Deliberately after `load`: registration competes for bandwidth with the page
 * itself, and the flight board must render first. Nothing on the site depends
 * on the worker, so a browser without support, or a failed registration, costs
 * only the offline copy.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Never register from a dev build: no worker is generated there, and a
    // stale one caching a hot-reloading server looks like an application bug.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Offline support is a progressive enhancement; there is nothing to
        // tell the visitor and nothing for them to do about it.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
