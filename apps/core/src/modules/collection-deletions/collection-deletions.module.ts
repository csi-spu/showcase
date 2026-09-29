import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { COLLECTION_DELETIONS_REPOSITORY } from './application/collection-deletions.ports';
import { CollectionDeletionsService } from './application/collection-deletions.service';
import { PostgresCollectionDeletionsRepository } from './infrastructure/postgres-collection-deletions.repository';
import { CollectionDeletionsExceptionFilter } from './transport/collection-deletions-exception.filter';
import { InstructorCollectionDeletionsController } from './transport/instructor-collection-deletions.controller';

@Module({
  controllers: [InstructorCollectionDeletionsController],
  imports: [AuthModule],
  providers: [
    CollectionDeletionsService,
    CollectionDeletionsExceptionFilter,
    { provide: COLLECTION_DELETIONS_REPOSITORY, useClass: PostgresCollectionDeletionsRepository },
  ],
})
export class CollectionDeletionsModule {}
