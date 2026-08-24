import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTH_CLOCK,
  AUTH_IDENTITY_PROTECTOR,
  AUTH_PROVIDER,
  AUTH_REPOSITORY,
  AUTH_TOKEN_GENERATOR,
} from './application/auth.ports';
import { StudentAuthService } from './application/student-auth.service';
import { DatabaseClient } from './infrastructure/database.client';
import {
  NodeClock,
  NodeIdentityProtector,
  NodeTokenGenerator,
} from './infrastructure/node-auth-crypto';
import { PostgresAuthRepository } from './infrastructure/postgres-auth.repository';
import { SupabaseAuthAdapter } from './infrastructure/supabase-auth.adapter';
import { AuthExceptionFilter } from './transport/auth-exception.filter';
import { StudentAuthController } from './transport/student-auth.controller';
import { StudentAuthCookieService } from './transport/student-auth-cookie.service';
import { StudentOriginGuard } from './transport/student-origin.guard';

@Module({
  controllers: [StudentAuthController],
  providers: [
    DatabaseClient,
    StudentAuthService,
    StudentAuthCookieService,
    StudentOriginGuard,
    AuthExceptionFilter,
    { provide: AUTH_CLOCK, useClass: NodeClock },
    {
      inject: [ConfigService],
      provide: AUTH_IDENTITY_PROTECTOR,
      useFactory: (config: ConfigService) =>
        new NodeIdentityProtector(config.getOrThrow<string>('AUTH_IDENTITY_SECRET')),
    },
    {
      inject: [ConfigService],
      provide: AUTH_PROVIDER,
      useFactory: (config: ConfigService) =>
        new SupabaseAuthAdapter({
          apiKey: config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY'),
          baseUrl: config.getOrThrow<string>('SUPABASE_URL'),
          timeoutMilliseconds: config.getOrThrow<number>('SUPABASE_AUTH_TIMEOUT_MS'),
        }),
    },
    { provide: AUTH_REPOSITORY, useClass: PostgresAuthRepository },
    { provide: AUTH_TOKEN_GENERATOR, useClass: NodeTokenGenerator },
  ],
  exports: [DatabaseClient],
})
export class AuthModule {}
