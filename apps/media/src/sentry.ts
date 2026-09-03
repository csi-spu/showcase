import * as Sentry from '@sentry/node';

export function reportMediaError(error: unknown): void {
  try {
    Sentry.captureException(error, {
      tags: {
        errorCode: 'MEDIA_INTERNAL_ERROR',
        operation: 'media_request',
        runtime: 'server',
      },
    });
  } catch {
    // Error reporting must never change media request handling.
  }
}

export async function flushMediaSentry(timeoutMilliseconds = 2_000): Promise<boolean> {
  try {
    return await Sentry.flush(timeoutMilliseconds);
  } catch {
    return false;
  }
}
