import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { CatalogError } from '../application/catalog.service';

@Catch()
export class CatalogExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CatalogExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    if (error instanceof BadRequestException) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
      return;
    }
    if (error instanceof CatalogError) {
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    this.logger.error({ errorCode: 'CATALOG_INTERNAL_ERROR', operation: 'public_catalog_query' });
    response.status(503).json({ error: { code: 'CATALOG_SERVICE_UNAVAILABLE' } });
  }
}
