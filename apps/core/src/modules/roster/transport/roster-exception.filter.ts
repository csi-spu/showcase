import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { RosterImportError } from '../application/roster-import.service';
import { safeErrorLogFields } from '../../../observability/error-log';

@Catch()
export class RosterExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RosterExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof AuthError || error instanceof RosterImportError) {
      if (error.status >= 500) {
        this.logger.warn({
          ...safeErrorLogFields(error),
          errorCode: error.code,
          operation: 'roster_request_rejected',
          status: error.status,
        });
      }
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    this.logger.error({
      ...safeErrorLogFields(error),
      errorCode: 'ROSTER_INTERNAL_ERROR',
      operation: 'roster_request',
    });
    response.status(503).json({ error: { code: 'ROSTER_SERVICE_UNAVAILABLE' } });
  }
}
