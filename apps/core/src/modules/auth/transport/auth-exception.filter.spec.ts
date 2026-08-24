import { ArgumentsHost, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthExceptionFilter } from './auth-exception.filter';
import { StudentAuthCookieService } from './student-auth-cookie.service';

describe('AuthExceptionFilter', () => {
  afterEach(() => {
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
    const cookies = { clear: jest.fn() } as unknown as StudentAuthCookieService;
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const filter = new AuthExceptionFilter(cookies);

    filter.catch(new Error('provider-token=must-not-appear'), host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'AUTH_SERVICE_UNAVAILABLE' },
    });
    expect(logger).toHaveBeenCalledWith({
      errorCode: 'AUTH_INTERNAL_ERROR',
      operation: 'student_auth_request',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain('provider-token');
  });
});
