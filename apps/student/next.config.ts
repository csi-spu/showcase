import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
