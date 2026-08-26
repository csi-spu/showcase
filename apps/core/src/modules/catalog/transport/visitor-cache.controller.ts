import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { CatalogService } from '../application/catalog.service';
import { VisitorCacheGuard } from './visitor-cache.guard';

@Controller('internal/visitor/cache-version')
@UseGuards(VisitorCacheGuard)
export class VisitorCacheController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  getCacheVersion() {
    return this.catalog.getCacheVersion();
  }
}
