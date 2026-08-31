import { ArgumentsHost, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { RosterExceptionFilter } from './roster-exception.filter';

describe('RosterExceptionFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts raw Roster rows and Student IDs from unexpected responses and logs', () => {
    const json = jest.fn();
    const status = jest.fn();
    const response = { json, status } as unknown as Response;
    status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new RosterExceptionFilter().catch(
      new Error('student_id=69000001,first_name_th=ข้อมูลลับ'),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ error: { code: 'ROSTER_SERVICE_UNAVAILABLE' } });
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'ROSTER_INTERNAL_ERROR',
        operation: 'roster_request',
        errorName: 'Error',
      }),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain('69000001');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('ข้อมูลลับ');
  });
});
