import { createErrorMonitoringOptions } from '@showcase/observability';
import * as Sentry from '@sentry/nestjs';

const gitSha = process.env.GIT_SHA;

Sentry.init(
  createErrorMonitoringOptions({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV,
    release: gitSha === undefined ? undefined : `showcase-core@${gitSha}`,
    runtime: 'api',
    service: 'core',
  }),
);
