import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuthModule } from '../auth/auth.module';
import {
  WORKS_CLOCK,
  WORKS_CURSOR_CODEC,
  WORKS_REPOSITORY,
  type WorksClock,
} from './application/works.ports';
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
import { LocalWorkMediaStorage } from './infrastructure/local-work-media.storage';
import { PostgresWorksRepository } from './infrastructure/postgres-works.repository';
import { StudentWorksController } from './transport/student-works.controller';
import { WorksExceptionFilter } from './transport/works-exception.filter';
import { WorkRevisionsService } from './application/work-revisions.service';
import { WORK_REVISIONS_REPOSITORY } from './application/work-revisions.ports';
import { PostgresWorkRevisionsRepository } from './infrastructure/postgres-work-revisions.repository';
import { AdminWorkRevisionsController } from './transport/admin-work-revisions.controller';
import { StudentWorkRevisionsController } from './transport/student-work-revisions.controller';
import { ReviewsService } from './application/reviews.service';
import { REVIEWS_REPOSITORY } from './application/reviews.ports';
import { PostgresReviewsRepository } from './infrastructure/postgres-reviews.repository';
import { StudentReviewsController } from './transport/student-reviews.controller';
import { PublicationService } from './application/publication.service';
import { PUBLICATION_REPOSITORY } from './application/publication.ports';
import { PostgresPublicationRepository } from './infrastructure/postgres-publication.repository';
import { PublicWorksController } from './transport/public-works.controller';
import { AdminCorrectionsService } from './application/admin-corrections.service';
import { ADMIN_CORRECTIONS_REPOSITORY } from './application/admin-corrections.ports';
import { WorkRecoveryService } from './application/work-recovery.service';
import { WORK_RECOVERY_REPOSITORY } from './application/work-recovery.ports';
import { PostgresWorkRecoveryRepository } from './infrastructure/postgres-work-recovery.repository';
import { AdminWorkRecoveryController } from './transport/admin-work-recovery.controller';
import { StudentWorkRecoveryController } from './transport/student-work-recovery.controller';
import { AttributionRemovalService } from './application/attribution-removal.service';
import { ATTRIBUTION_REMOVAL_REPOSITORY } from './application/attribution-removal.ports';
import { PostgresAttributionRemovalRepository } from './infrastructure/postgres-attribution-removal.repository';
import { WorkWorkspaceCursorCodec } from './domain/work-workspace-cursor';
import {
  WORK_CONTRIBUTORS_CLOCK,
  WORK_CONTRIBUTORS_REPOSITORY,
  type WorkContributorsClock,
} from './application/work-contributors.ports';
import { WorkContributorsService } from './application/work-contributors.service';
import { PostgresWorkContributorsRepository } from './infrastructure/postgres-work-contributors.repository';
import { StudentWorkContributorsController } from './transport/student-work-contributors.controller';

@Module({
  controllers: [
    AdminWorkRecoveryController,
    AdminWorkRevisionsController,
    PublicWorksController,
    StudentReviewsController,
    StudentWorkRevisionsController,
    StudentWorkRecoveryController,
    StudentWorkContributorsController,
    StudentWorksController,
  ],
  imports: [AuthModule],
  providers: [
    WorksService,
    WorkMediaService,
    WorkRevisionsService,
    ReviewsService,
    PublicationService,
    AdminCorrectionsService,
    WorkRecoveryService,
    AttributionRemovalService,
    WorkContributorsService,
    WorksExceptionFilter,
    { provide: WORKS_REPOSITORY, useClass: PostgresWorksRepository },
    {
      inject: [ConfigService],
      provide: WORKS_CURSOR_CODEC,
      useFactory: (config: ConfigService) =>
        new WorkWorkspaceCursorCodec(config.getOrThrow<string>('CATALOG_CURSOR_SECRET')),
    },
    PostgresWorkRevisionsRepository,
    { provide: WORK_REVISIONS_REPOSITORY, useExisting: PostgresWorkRevisionsRepository },
    { provide: ADMIN_CORRECTIONS_REPOSITORY, useExisting: PostgresWorkRevisionsRepository },
    { provide: REVIEWS_REPOSITORY, useClass: PostgresReviewsRepository },
    { provide: PUBLICATION_REPOSITORY, useClass: PostgresPublicationRepository },
    { provide: WORK_RECOVERY_REPOSITORY, useClass: PostgresWorkRecoveryRepository },
    { provide: ATTRIBUTION_REMOVAL_REPOSITORY, useClass: PostgresAttributionRemovalRepository },
    { provide: WORK_CONTRIBUTORS_REPOSITORY, useClass: PostgresWorkContributorsRepository },
    { provide: WORK_MEDIA_REPOSITORY, useClass: PostgresWorkMediaRepository },
    { provide: WORK_MEDIA_INSPECTOR, useClass: SharpWorkMediaInspector },
    {
      inject: [ConfigService],
      provide: WORK_MEDIA_STORAGE,
      useFactory: (config: ConfigService): WorkMediaStorage => {
        if (config.getOrThrow<string>('APP_ENV') === 'test') {
          return new LocalWorkMediaStorage(config.getOrThrow<string>('MEDIA_PROVIDER_URL'));
        }
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
    {
      provide: WORK_CONTRIBUTORS_CLOCK,
      useValue: { now: () => new Date() } satisfies WorkContributorsClock,
    },
  ],
})
export class WorksModule {}
