import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { RosterImportError } from '../application/roster-import.service';

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
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    this.logger.error({ errorCode: 'ROSTER_INTERNAL_ERROR', operation: 'roster_request' });
    response.status(503).json({ error: { code: 'ROSTER_SERVICE_UNAVAILABLE' } });
  }
}
