import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CATALOG_REPOSITORY } from './application/catalog.ports';
import {
  CACHE_INVALIDATION_REPOSITORY,
  PUBLIC_CACHE_INVALIDATOR,
} from './application/cache-invalidation.ports';
import { CacheInvalidationService } from './application/cache-invalidation.service';
import { CatalogService } from './application/catalog.service';
import { PostgresCatalogRepository } from './infrastructure/postgres-catalog.repository';
import { CloudflarePublicCacheInvalidator } from './infrastructure/cloudflare-public-cache.invalidator';
import { PostgresCacheInvalidationRepository } from './infrastructure/postgres-cache-invalidation.repository';
import { CatalogController } from './transport/catalog.controller';
import { CatalogExceptionFilter } from './transport/catalog-exception.filter';
import { VisitorCacheController } from './transport/visitor-cache.controller';
import { VisitorCacheGuard } from './transport/visitor-cache.guard';

@Module({
  controllers: [CatalogController, VisitorCacheController],
  exports: [CacheInvalidationService, CatalogService],
  imports: [AuthModule],
  providers: [
    CatalogService,
    CatalogExceptionFilter,
    VisitorCacheGuard,
    CacheInvalidationService,
    { provide: CATALOG_REPOSITORY, useClass: PostgresCatalogRepository },
    {
      provide: CACHE_INVALIDATION_REPOSITORY,
      useClass: PostgresCacheInvalidationRepository,
    },
    { provide: PUBLIC_CACHE_INVALIDATOR, useClass: CloudflarePublicCacheInvalidator },
  ],
})
export class CatalogModule {}
