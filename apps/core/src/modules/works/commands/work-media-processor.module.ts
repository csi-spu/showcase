import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from '../../../config/environment.schema';
import { WorksModule } from '../works.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['apps/core/.env', '.env'],
      isGlobal: true,
      validate: parseEnvironment,
    }),
    WorksModule,
  ],
})
export class WorkMediaProcessorModule {}
