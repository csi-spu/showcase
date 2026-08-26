import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { NotificationsError } from '../application/notifications.error';

@Catch()
export class NotificationsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(NotificationsExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof AuthError || error instanceof NotificationsError) {
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    this.logger.error({
      errorCode: 'NOTIFICATIONS_INTERNAL_ERROR',
      operation: 'notifications_request',
    });
    response.status(503).json({ error: { code: 'NOTIFICATIONS_SERVICE_UNAVAILABLE' } });
  }
}
