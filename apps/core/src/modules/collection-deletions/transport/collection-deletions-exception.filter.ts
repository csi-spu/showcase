import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { CollectionDeletionsError } from '../application/collection-deletions.ports';
import { safeErrorLogFields } from '../../../observability/error-log';
import { reportOperationalError } from '../../../observability/sentry';

@Catch()
export class CollectionDeletionsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CollectionDeletionsExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof AuthError || error instanceof CollectionDeletionsError) {
      if (error.status >= 500) {
        reportOperationalError(error, {
          errorCode: error.code,
          operation: 'collection_deletions_request_rejected',
          runtime: 'api',
        });
        this.logger.warn({
          ...safeErrorLogFields(error),
          errorCode: error.code,
          operation: 'collection_deletions_request_rejected',
          status: error.status,
        });
      }
      const details = error instanceof CollectionDeletionsError ? error.details : undefined;
      response.status(error.status).json({
        error: details === undefined ? { code: error.code } : { code: error.code, details },
      });
      return;
    }
    reportOperationalError(error, {
      errorCode: 'COLLECTION_DELETIONS_INTERNAL_ERROR',
      operation: 'collection_deletions_request',
      runtime: 'api',
    });
    this.logger.error({
      ...safeErrorLogFields(error),
      errorCode: 'COLLECTION_DELETIONS_INTERNAL_ERROR',
      operation: 'collection_deletions_request',
    });
    response.status(503).json({ error: { code: 'COLLECTION_DELETIONS_SERVICE_UNAVAILABLE' } });
  }
}
