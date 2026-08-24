import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const allowedOrigins = config.getOrThrow<string[]>('CORS_ALLOWED_ORIGINS');

  app.enableCors({
    credentials: true,
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
