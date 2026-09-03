import * as Sentry from '@sentry/nestjs';
import { flushSentry, reportOperationalError } from './sentry';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  flush: jest.fn(),
}));

describe('Sentry operational error reporting', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('captures only stable bounded tags and never attaches error details as context', () => {
    const error = new Error('student_id=69000001,token=private');

    reportOperationalError(error, {
      errorCode: 'ROSTER_PROCESSING_FAILED',
      operation: 'roster_processing',
      runtime: 'roster-worker',
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        errorCode: 'ROSTER_PROCESSING_FAILED',
        operation: 'roster_processing',
        runtime: 'roster-worker',
      },
    });
  });

  it('does not let provider failures escape into application control flow', () => {
    jest.mocked(Sentry.captureException).mockImplementation(() => {
      throw new Error('Sentry unavailable');
    });

    expect(() =>
      reportOperationalError(new Error('application failure'), {
        errorCode: 'INTERNAL_ERROR',
        operation: 'request',
        runtime: 'api',
      }),
    ).not.toThrow();
  });

  it('bounds flushing and maps SDK failures to false', async () => {
    jest.mocked(Sentry.flush).mockRejectedValue(new Error('Sentry unavailable'));

    await expect(flushSentry()).resolves.toBe(false);
    expect(Sentry.flush).toHaveBeenCalledWith(2_000);
  });
});
