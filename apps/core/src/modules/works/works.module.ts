import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuthModule } from '../auth/auth.module';
import { WORKS_CLOCK, WORKS_REPOSITORY, type WorksClock } from './application/works.ports';
import { WorksService } from './application/works.service';
import {
  WORK_MEDIA_CLOCK,
  WORK_MEDIA_ID_GENERATOR,
  WORK_MEDIA_INSPECTOR,
  WORK_MEDIA_REPOSITORY,
  WORK_MEDIA_STORAGE,
  type WorkMediaClock,
  type WorkMediaStorage,
} from './application/work-media.ports';
import { WorkMediaService } from './application/work-media.service';
import { PostgresWorkMediaRepository } from './infrastructure/postgres-work-media.repository';
import { R2WorkMediaStorage } from './infrastructure/r2-work-media.storage';
import { SharpWorkMediaInspector } from './infrastructure/sharp-work-media.inspector';
import { UnavailableWorkMediaStorage } from './infrastructure/unavailable-work-media.storage';
import { PostgresWorksRepository } from './infrastructure/postgres-works.repository';
import { StudentWorksController } from './transport/student-works.controller';
import { WorksExceptionFilter } from './transport/works-exception.filter';

@Module({
  controllers: [StudentWorksController],
  imports: [AuthModule],
  providers: [
    WorksService,
    WorkMediaService,
    WorksExceptionFilter,
    { provide: WORKS_REPOSITORY, useClass: PostgresWorksRepository },
    { provide: WORK_MEDIA_REPOSITORY, useClass: PostgresWorkMediaRepository },
    { provide: WORK_MEDIA_INSPECTOR, useClass: SharpWorkMediaInspector },
    {
      inject: [ConfigService],
      provide: WORK_MEDIA_STORAGE,
      useFactory: (config: ConfigService): WorkMediaStorage => {
        const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
        const bucket = config.get<string>('R2_BUCKET_NAME');
        const endpoint = config.get<string>('R2_ENDPOINT');
        const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
        if (
          accessKeyId === undefined ||
          bucket === undefined ||
          endpoint === undefined ||
          secretAccessKey === undefined
        ) {
          return new UnavailableWorkMediaStorage();
        }
        return new R2WorkMediaStorage({
          accessKeyId,
          bucket,
          endpoint,
          secretAccessKey,
          timeoutMilliseconds: config.getOrThrow<number>('R2_TIMEOUT_MS'),
        });
      },
    },
    { provide: WORK_MEDIA_CLOCK, useValue: { now: () => new Date() } satisfies WorkMediaClock },
    { provide: WORK_MEDIA_ID_GENERATOR, useValue: { generate: () => randomUUID() } },
    {
      provide: WORKS_CLOCK,
      useValue: { now: () => new Date() } satisfies WorksClock,
    },
  ],
})
export class WorksModule {}
