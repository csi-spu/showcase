import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AuthError } from '../application/auth.error';

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AuthExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }

    if (!(error instanceof AuthError)) {
      this.logger.error({
        errorCode: 'AUTH_INTERNAL_ERROR',
        operation: 'student_auth_request',
      });
      response.status(503).json({ error: { code: 'AUTH_SERVICE_UNAVAILABLE' } });
      return;
    }

    if (error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', error.retryAfterSeconds.toString());
    }
    response.status(error.status).json({ error: { code: error.code } });
  }
}
