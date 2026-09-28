import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from '../../../config/environment.schema';
import { CatalogModule } from '../catalog.module';

/*
 * Only what cache invalidation needs. Booting AppModule here would also start
 * the API's RosterWorker, and two of those race on the same Batch.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['apps/core/.env', '.env'],
      isGlobal: true,
      validate: parseEnvironment,
    }),
    CatalogModule,
  ],
})
export class CacheInvalidationWorkerModule {}
