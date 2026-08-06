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
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin/'],
    },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
