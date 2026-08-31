import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from './config/environment.schema';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { RosterModule } from './modules/roster/roster.module';
import { AccountControlsModule } from './modules/account-controls/account-controls.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { WorksModule } from './modules/works/works.module';
import { CatalogModule } from './modules/catalog/catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['apps/core/.env', '.env'],
      isGlobal: true,
      validate: parseEnvironment,
    }),
    AuthModule,
    AccountControlsModule,
    CatalogModule,
    HealthModule,
    ProfilesModule,
    RosterModule,
    WorksModule,
  ],
})
export class AppModule {}
