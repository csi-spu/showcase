import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express, NextFunction, Request, Response } from 'express';
import { raw } from 'express';
import helmet from 'helmet';
import { MAX_ROSTER_FILE_BYTES } from './modules/roster/domain/roster-csv';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const allowedOrigins = config.getOrThrow<string[]>('CORS_ALLOWED_ORIGINS');
  const express = app.getHttpAdapter().getInstance() as Express;

  express.set('trust proxy', 1);
  express.use(
    '/v1/internal/admin/roster-batches',
    raw({ limit: MAX_ROSTER_FILE_BYTES + 1024 * 1024, type: 'text/csv' }),
  );
  express.use(handleBodyParserError);
  app.enableCors({
    origin: allowedOrigins,
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}

export function handleBodyParserError(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 413) {
    response
      .status(413)
      .setHeader('Cache-Control', 'no-store')
      .json({ error: { code: 'ROSTER_FILE_TOO_LARGE' } });
    return;
  }
  next(error);
}
