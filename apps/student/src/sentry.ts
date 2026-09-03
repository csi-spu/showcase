import { createErrorMonitoringOptions } from '@showcase/observability';
import * as Sentry from '@sentry/nextjs';

export function initializeSentry(runtime: 'browser' | 'edge' | 'server'): void {
  Sentry.init(
    createErrorMonitoringOptions({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE,
      runtime,
      service: 'student',
    }),
  );
}
