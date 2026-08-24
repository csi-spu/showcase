import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from './config/environment.schema';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: parseEnvironment,
    }),
    HealthModule,
  ],
})
export class AppModule {}
