import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { CollectionFormsError } from '../application/collection-forms.ports';
import { safeErrorLogFields } from '../../../observability/error-log';
import { reportOperationalError } from '../../../observability/sentry';

/**
 * Turns every failure on the collection-forms routes into one error shape.
 *
 * `{ error: { code } }` is the shape every Core surface answers with and the
 * only one the BFF client parses, so a refusal that leaves here in any other
 * shape reaches the browser as a generic outage instead of as its own reason.
 */
@Catch()
export class CollectionFormsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CollectionFormsExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof AuthError || error instanceof CollectionFormsError) {
      if (error.status >= 500) {
        reportOperationalError(error, {
          errorCode: error.code,
          operation: 'collection_forms_request_rejected',
          runtime: 'api',
        });
        this.logger.warn({
          ...safeErrorLogFields(error),
          errorCode: error.code,
          operation: 'collection_forms_request_rejected',
          status: error.status,
        });
      }
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    reportOperationalError(error, {
      errorCode: 'COLLECTION_FORMS_INTERNAL_ERROR',
      operation: 'collection_forms_request',
      runtime: 'api',
    });
    this.logger.error({
      ...safeErrorLogFields(error),
      errorCode: 'COLLECTION_FORMS_INTERNAL_ERROR',
      operation: 'collection_forms_request',
    });
    response.status(503).json({ error: { code: 'COLLECTION_FORMS_SERVICE_UNAVAILABLE' } });
  }
}
