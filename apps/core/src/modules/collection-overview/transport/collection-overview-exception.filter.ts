import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { safeErrorLogFields } from '../../../observability/error-log';
import { reportOperationalError } from '../../../observability/sentry';
import { AuthError } from '../../auth/application/auth.error';
import { CollectionOverviewError } from '../application/collection-overview.ports';

@Catch()
export class CollectionOverviewExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CollectionOverviewExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof CollectionOverviewError) {
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    if (error instanceof AuthError) {
      if (error.status >= 500) {
        reportOperationalError(error, {
          errorCode: error.code,
          operation: 'collection_overview_authorization',
          runtime: 'api',
        });
        this.logger.warn({
          ...safeErrorLogFields(error),
          errorCode: error.code,
          operation: 'collection_overview_authorization',
          status: error.status,
        });
      }
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }

    reportOperationalError(error, {
      errorCode: 'COLLECTION_OVERVIEW_INTERNAL_ERROR',
      operation: 'collection_overview_read',
      runtime: 'api',
    });
    this.logger.error({
      ...safeErrorLogFields(error),
      errorCode: 'COLLECTION_OVERVIEW_INTERNAL_ERROR',
      operation: 'collection_overview_read',
    });
    response.status(503).json({ error: { code: 'COLLECTION_OVERVIEW_SERVICE_UNAVAILABLE' } });
  }
}
