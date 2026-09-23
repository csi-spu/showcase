import * as Sentry from '@sentry/nestjs';

interface OperationalErrorContext {
  errorCode: string;
  operation: string;
  runtime:
    | 'api'
    | 'cache-worker'
    | 'collection-file-inspector'
    | 'collection-reminder-dispatcher'
    | 'media-processor'
    | 'roster-worker';
}

export function reportOperationalError(error: unknown, context: OperationalErrorContext): void {
  try {
    Sentry.captureException(error, {
      tags: {
        errorCode: context.errorCode,
        operation: context.operation,
        runtime: context.runtime,
      },
    });
  } catch {
    // Error reporting must never change application control flow.
  }
}

export async function flushSentry(timeoutMilliseconds = 2_000): Promise<boolean> {
  try {
    return await Sentry.flush(timeoutMilliseconds);
  } catch {
    return false;
  }
}
