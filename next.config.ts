import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  /**
   * The airport self-hosts. `standalone` emits a self-contained server bundle
   * that runs under plain Node, with no platform-specific runtime (plan §3.4).
   * Nothing in this project may depend on Vercel.
   */
  output: 'standalone',

  /** Don't advertise the framework version. */
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
