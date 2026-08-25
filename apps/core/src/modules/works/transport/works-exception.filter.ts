import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { AttributionInvitationError } from '../application/attribution-invitations.service';
import { WorkError } from '../application/works.service';
import { WorkMediaError } from '../application/work-media.service';

@Catch()
export class WorksExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WorksExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (
      error instanceof AuthError ||
      error instanceof AttributionInvitationError ||
      error instanceof WorkError ||
      error instanceof WorkMediaError
    ) {
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    this.logger.error({
      errorCode: 'WORKS_INTERNAL_ERROR',
      operation: 'work_authoring_request',
    });
    response.status(503).json({ error: { code: 'WORKS_SERVICE_UNAVAILABLE' } });
  }
}
