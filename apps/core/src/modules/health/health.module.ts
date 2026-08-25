import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '../auth/auth.module';
import { DatabaseReadinessIndicator } from './database-readiness.indicator';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, TerminusModule],
  providers: [DatabaseReadinessIndicator],
})
export class HealthModule {}
