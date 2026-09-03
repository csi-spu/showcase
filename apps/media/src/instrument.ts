import { createErrorMonitoringOptions } from '@showcase/observability';
import * as Sentry from '@sentry/node';

const gitSha = process.env.GIT_SHA;

Sentry.init(
  createErrorMonitoringOptions({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV,
    release: gitSha === undefined ? undefined : `showcase-media@${gitSha}`,
    runtime: 'server',
    service: 'media',
  }),
);
