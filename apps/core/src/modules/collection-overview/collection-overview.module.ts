import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { COLLECTION_OVERVIEW_REPOSITORY } from './application/collection-overview.ports';
import { CollectionOverviewService } from './application/collection-overview.service';
import { PostgresCollectionOverviewRepository } from './infrastructure/postgres-collection-overview.repository';
import { CollectionOverviewExceptionFilter } from './transport/collection-overview-exception.filter';
import { InstructorCollectionOverviewController } from './transport/instructor-collection-overview.controller';

@Module({
  controllers: [InstructorCollectionOverviewController],
  imports: [AuthModule],
  providers: [
    CollectionOverviewService,
    CollectionOverviewExceptionFilter,
    {
      provide: COLLECTION_OVERVIEW_REPOSITORY,
      useClass: PostgresCollectionOverviewRepository,
    },
  ],
})
export class CollectionOverviewModule {}
