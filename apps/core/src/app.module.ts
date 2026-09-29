import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { parseEnvironment } from './config/environment.schema';
import { AuthModule } from './modules/auth/auth.module';
import { CollectionDeletionsModule } from './modules/collection-deletions/collection-deletions.module';
import { CollectionGroupsModule } from './modules/collection-groups/collection-groups.module';
import { CollectionFormsModule } from './modules/collection-forms/collection-forms.module';
import { CollectionOverviewModule } from './modules/collection-overview/collection-overview.module';
import { HealthModule } from './modules/health/health.module';
import { RosterModule } from './modules/roster/roster.module';
import { AccountControlsModule } from './modules/account-controls/account-controls.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { WorksModule } from './modules/works/works.module';
import { CatalogModule } from './modules/catalog/catalog.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['apps/core/.env', '.env'],
      isGlobal: true,
      validate: parseEnvironment,
    }),
    AuthModule,
    AccountControlsModule,
    CatalogModule,
    CollectionDeletionsModule,
    CollectionGroupsModule,
    CollectionFormsModule,
    CollectionOverviewModule,
    HealthModule,
    ProfilesModule,
    RosterModule,
    WorksModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
export class AppModule {}
