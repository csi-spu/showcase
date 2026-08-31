import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { AccountControlsError } from '../application/account-controls.service';
import { safeErrorLogFields } from '../../../observability/error-log';

@Catch()
export class AccountControlsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AccountControlsExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof AuthError || error instanceof AccountControlsError) {
      if (error.status >= 500) {
        this.logger.warn({
          ...safeErrorLogFields(error),
          errorCode: error.code,
          operation: 'account_controls_request_rejected',
          status: error.status,
        });
      }
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    this.logger.error({
      ...safeErrorLogFields(error),
      errorCode: 'ACCOUNT_CONTROLS_INTERNAL_ERROR',
      operation: 'account_controls_request',
    });
    response.status(503).json({ error: { code: 'ACCOUNT_CONTROLS_SERVICE_UNAVAILABLE' } });
  }
}
