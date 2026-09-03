import path from 'node:path';

import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
};

const releaseName = process.env.GIT_SHA && `showcase-admin@${process.env.GIT_SHA}`;
const canUploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && releaseName,
);
const nextIntlConfig = withNextIntl(nextConfig);

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextIntlConfig, {
      ...(process.env.SENTRY_AUTH_TOKEN ? { authToken: process.env.SENTRY_AUTH_TOKEN } : {}),
      ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
      project: 'showcase-admin',
      ...(releaseName ? { release: { name: releaseName } } : {}),
      silent: !process.env.CI,
      sourcemaps: { disable: !canUploadSourceMaps },
      suppressOnRouterTransitionStartWarning: true,
      telemetry: false,
      widenClientFileUpload: true,
    })
  : nextIntlConfig;
