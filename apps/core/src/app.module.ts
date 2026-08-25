import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from './config/environment.schema';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { RosterModule } from './modules/roster/roster.module';
import { AccountControlsModule } from './modules/account-controls/account-controls.module';
import { ProfilesModule } from './modules/profiles/profiles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: parseEnvironment,
    }),
    AuthModule,
    AccountControlsModule,
    HealthModule,
    ProfilesModule,
    RosterModule,
  ],
})
export class AppModule {}
