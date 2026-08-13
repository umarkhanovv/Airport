import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';

/**
 * robots.txt.
 *
 * Stage 6 needs the admin tree excluded from crawling (plan §9.1 — caching or
 * indexing an admin page is a real leak). The sitemap reference and the rest of
 * the SEO surface land in Stage 9; this file is deliberately minimal until then
 * and `sitemap` is pointed at the URL Stage 9 will serve.
 */
/**
 * Read at request time, like `app/sitemap.ts` next door.
 *
 * Without this the file is prerendered, and everything it depends on is fixed
 * at build time: `SITE_URL` and the preview flag both come from the
 * environment, which on every host this is meant to run on is set for the
 * *running* container, not the build. A preview deployment therefore published
 * `Allow: /` and a sitemap pointing at localhost, having been told to publish
 * neither — a safeguard that silently does nothing is worse than no safeguard,
 * because it is believed.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  /*
   * A preview deployment keeps everything out of search, and no sitemap.
   *
   * A review copy is the airport's name, logo, address and telephone numbers
   * over content nobody has read yet. Indexed, it competes with the airport's
   * own site for the airport's own name, and a passenger could land on an
   * unreviewed page believing it official.
   */
  if (env.isPreview) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin/'],
    },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
