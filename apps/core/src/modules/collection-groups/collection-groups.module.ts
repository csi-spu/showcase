import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { COLLECTION_GROUPS_REPOSITORY } from './application/collection-groups.ports';
import { CollectionGroupsService } from './application/collection-groups.service';
import { PostgresCollectionGroupsRepository } from './infrastructure/postgres-collection-groups.repository';
import { InstructorCollectionGroupsController } from './transport/instructor-collection-groups.controller';
import { CollectionGroupsExceptionFilter } from './transport/collection-groups-exception.filter';

@Module({
  controllers: [InstructorCollectionGroupsController],
  imports: [AuthModule],
  providers: [
    CollectionGroupsService,
    CollectionGroupsExceptionFilter,
    { provide: COLLECTION_GROUPS_REPOSITORY, useClass: PostgresCollectionGroupsRepository },
  ],
  exports: [CollectionGroupsService],
})
export class CollectionGroupsModule {}
