import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { CollectionGroupsError } from '../application/collection-groups.ports';
import { safeErrorLogFields } from '../../../observability/error-log';
import { reportOperationalError } from '../../../observability/sentry';

@Catch()
export class CollectionGroupsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CollectionGroupsExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof AuthError || error instanceof CollectionGroupsError) {
      if (error.status >= 500) {
        reportOperationalError(error, {
          errorCode: error.code,
          operation: 'collection_groups_request_rejected',
          runtime: 'api',
        });
        this.logger.warn({
          ...safeErrorLogFields(error),
          errorCode: error.code,
          operation: 'collection_groups_request_rejected',
          status: error.status,
        });
      }
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    reportOperationalError(error, {
      errorCode: 'COLLECTION_GROUPS_INTERNAL_ERROR',
      operation: 'collection_groups_request',
      runtime: 'api',
    });
    this.logger.error({
      ...safeErrorLogFields(error),
      errorCode: 'COLLECTION_GROUPS_INTERNAL_ERROR',
      operation: 'collection_groups_request',
    });
    response.status(503).json({ error: { code: 'COLLECTION_GROUPS_SERVICE_UNAVAILABLE' } });
  }
}
