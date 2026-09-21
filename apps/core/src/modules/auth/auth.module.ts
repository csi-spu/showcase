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
import { InstructorAuthService } from './application/instructor-auth.service';
import { StudentCollectionAuthService } from './application/student-collection-auth.service';
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
import {
  BetterAuthAdminProvisioningProvider,
  BetterAuthEngine,
  BetterAuthProvider,
} from './infrastructure/better-auth.adapter';
import { AuthExceptionFilter } from './transport/auth-exception.filter';
import { StudentAuthController } from './transport/student-auth.controller';
import { StudentBffGuard } from './transport/student-bff.guard';
import { AdminAuthController } from './transport/admin-auth.controller';
import { AdminBffGuard } from './transport/admin-bff.guard';
import { InstructorAuthController } from './transport/instructor-auth.controller';
import { InstructorBffGuard } from './transport/instructor-bff.guard';
import { StudentCollectionAuthController } from './transport/student-collection-auth.controller';
import { StudentCollectionBffGuard } from './transport/student-collection-bff.guard';

@Module({
  controllers: [
    AdminAuthController,
    InstructorAuthController,
    StudentAuthController,
    StudentCollectionAuthController,
  ],
  providers: [
    DatabaseClient,
    {
      inject: [ConfigService, DatabaseClient],
      provide: BetterAuthEngine,
      useFactory: (config: ConfigService, database: DatabaseClient) =>
        new BetterAuthEngine(database.prisma, {
          baseUrl: config.getOrThrow<string>('BETTER_AUTH_BASE_URL'),
          secret: config.getOrThrow<string>('BETTER_AUTH_SECRET'),
        }),
    },
    AdminAuthService,
    AdminBffGuard,
    AdminProvisioningService,
    InstructorAuthService,
    InstructorBffGuard,
    StudentAuthService,
    StudentBffGuard,
    StudentCollectionAuthService,
    StudentCollectionBffGuard,
    AuthExceptionFilter,
    { provide: AUTH_CLOCK, useClass: NodeClock },
    {
      inject: [ConfigService],
      provide: AUTH_IDENTITY_PROTECTOR,
      useFactory: (config: ConfigService) =>
        new NodeIdentityProtector(config.getOrThrow<string>('AUTH_IDENTITY_SECRET')),
    },
    {
      provide: AUTH_PROVIDER,
      useFactory: (engine: BetterAuthEngine) => new BetterAuthProvider(engine),
      inject: [BetterAuthEngine],
    },
    { provide: AUTH_REPOSITORY, useClass: PostgresAuthRepository },
    { provide: AUTH_TOKEN_GENERATOR, useClass: NodeTokenGenerator },
    {
      provide: ADMIN_PROVISIONING_REPOSITORY,
      useClass: PostgresAdminProvisioningRepository,
    },
    {
      provide: ADMIN_PROVISIONING_PROVIDER,
      useFactory: (engine: BetterAuthEngine) => new BetterAuthAdminProvisioningProvider(engine),
      inject: [BetterAuthEngine],
    },
  ],
  exports: [
    AdminAuthService,
    AdminProvisioningService,
    AUTH_CLOCK,
    AUTH_IDENTITY_PROTECTOR,
    AUTH_TOKEN_GENERATOR,
    DatabaseClient,
    BetterAuthEngine,
    InstructorAuthService,
    StudentAuthService,
    StudentBffGuard,
    StudentCollectionAuthService,
  ],
})
export class AuthModule {}
