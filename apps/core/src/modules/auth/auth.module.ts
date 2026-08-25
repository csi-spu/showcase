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
import { AdminAuthService } from './application/admin-auth.service';
import {
  ADMIN_PROVISIONING_PROVIDER,
  ADMIN_PROVISIONING_REPOSITORY,
} from './application/admin-provisioning.ports';
import { AdminProvisioningService } from './application/admin-provisioning.service';
import { DatabaseClient } from './infrastructure/database.client';
import {
  NodeClock,
  NodeIdentityProtector,
  NodeTokenGenerator,
} from './infrastructure/node-auth-crypto';
import { PostgresAuthRepository } from './infrastructure/postgres-auth.repository';
import { PostgresAdminProvisioningRepository } from './infrastructure/postgres-admin-provisioning.repository';
import { SupabaseAdminAuthAdapter } from './infrastructure/supabase-admin-auth.adapter';
import { SupabaseAuthAdapter } from './infrastructure/supabase-auth.adapter';
import { AuthExceptionFilter } from './transport/auth-exception.filter';
import { StudentAuthController } from './transport/student-auth.controller';
import { StudentBffGuard } from './transport/student-bff.guard';
import { AdminAuthController } from './transport/admin-auth.controller';
import { AdminBffGuard } from './transport/admin-bff.guard';

@Module({
  controllers: [AdminAuthController, StudentAuthController],
  providers: [
    DatabaseClient,
    AdminAuthService,
    AdminBffGuard,
    AdminProvisioningService,
    StudentAuthService,
    StudentBffGuard,
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
    {
      provide: ADMIN_PROVISIONING_REPOSITORY,
      useClass: PostgresAdminProvisioningRepository,
    },
    {
      inject: [ConfigService],
      provide: ADMIN_PROVISIONING_PROVIDER,
      useFactory: (config: ConfigService) =>
        new SupabaseAdminAuthAdapter({
          baseUrl: config.getOrThrow<string>('SUPABASE_URL'),
          secretKey: config.getOrThrow<string>('SUPABASE_SECRET_KEY'),
          timeoutMilliseconds: config.getOrThrow<number>('SUPABASE_AUTH_TIMEOUT_MS'),
        }),
    },
  ],
  exports: [
    AdminAuthService,
    AUTH_CLOCK,
    AUTH_IDENTITY_PROTECTOR,
    AUTH_TOKEN_GENERATOR,
    DatabaseClient,
  ],
})
export class AuthModule {}
