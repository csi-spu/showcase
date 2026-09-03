import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { reportOperationalError } from '../../../observability/sentry';
import { AuthError } from '../application/auth.error';
import { AuthExceptionFilter } from './auth-exception.filter';

jest.mock('../../../observability/sentry', () => ({ reportOperationalError: jest.fn() }));

describe('AuthExceptionFilter', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('redacts unexpected provider or persistence errors from responses and logs', () => {
    const json = jest.fn();
    const status = jest.fn();
    const response = {
      json,
      status,
    } as unknown as Response;
    status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const filter = new AuthExceptionFilter();

    filter.catch(new Error('provider-token=must-not-appear'), host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'AUTH_SERVICE_UNAVAILABLE' },
    });
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_INTERNAL_ERROR',
        operation: 'authentication_request',
        errorName: 'Error',
      }),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain('provider-token');
    expect(reportOperationalError).toHaveBeenCalledWith(expect.any(Error), {
      errorCode: 'AUTH_INTERNAL_ERROR',
      operation: 'authentication_request',
      runtime: 'api',
    });
  });

  it('captures operational 5xx errors but excludes expected 4xx control flow', () => {
    const json = jest.fn();
    const status = jest.fn();
    const response = { json, setHeader: jest.fn(), status } as unknown as Response;
    status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const filter = new AuthExceptionFilter();

    filter.catch(new BadRequestException(), host);
    filter.catch(new AuthError('UNAUTHENTICATED', 401), host);

    expect(reportOperationalError).not.toHaveBeenCalled();

    const unavailable = new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503);
    filter.catch(unavailable, host);

    expect(reportOperationalError).toHaveBeenCalledWith(unavailable, {
      errorCode: 'AUTH_PROVIDER_UNAVAILABLE',
      operation: 'authentication_request_rejected',
      runtime: 'api',
    });
  });
});
