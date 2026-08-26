import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  UseFilters,
} from '@nestjs/common';
import { PublicationService } from '../application/publication.service';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('public/works')
@UseFilters(WorksExceptionFilter)
export class PublicWorksController {
  constructor(private readonly publication: PublicationService) {}

  @Get(':workPublicId')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60')
  getWork(@Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string) {
    return this.publication.getPublicWork(workPublicId);
  }

  @Get(':workPublicId/media/:assetId/variants/:width')
  @Header('Cache-Control', 'private, no-store')
  getMedia(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Param('assetId', new ParseUUIDPipe({ version: '4' })) assetId: string,
    @Param('width', ParseIntPipe) width: number,
  ) {
    return this.publication.getPublicMedia(workPublicId, assetId, width);
  }
}
