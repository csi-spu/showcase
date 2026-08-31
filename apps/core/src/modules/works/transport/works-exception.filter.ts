import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { WorkError } from '../application/works.service';
import { WorkMediaError } from '../application/work-media.service';
import { WorkRevisionError } from '../application/work-revisions.service';
import { ReviewError } from '../application/reviews.service';
import { PublicationError } from '../application/publication.service';
import { AdminCorrectionError } from '../application/admin-corrections.service';
import { WorkRecoveryError } from '../application/work-recovery.service';
import { AttributionRemovalError } from '../application/attribution-removal.service';
import { WorkContributorError } from '../application/work-contributors.service';
import { safeErrorLogFields } from '../../../observability/error-log';

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
      error instanceof AdminCorrectionError ||
      error instanceof AttributionRemovalError ||
      error instanceof WorkContributorError ||
      error instanceof WorkError ||
      error instanceof WorkMediaError ||
      error instanceof PublicationError ||
      error instanceof ReviewError ||
      error instanceof WorkRevisionError ||
      error instanceof WorkRecoveryError
    ) {
      this.logger.warn({
        ...safeErrorLogFields(error),
        errorCode: error.code,
        operation: 'work_request_rejected',
        status: error.status,
      });
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    this.logger.error({
      ...safeErrorLogFields(error),
      errorCode: 'WORKS_INTERNAL_ERROR',
      operation: 'work_authoring_request',
    });
    response.status(503).json({ error: { code: 'WORKS_SERVICE_UNAVAILABLE' } });
  }
}
