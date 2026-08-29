import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AttributionRemovalService } from '../application/attribution-removal.service';
import { PublicationService } from '../application/publication.service';
import { WorksExceptionFilter } from './works-exception.filter';
import { CreateAttributionRemovalRequestDto } from './work-recovery.dto';

@Controller('public/works')
@UseFilters(WorksExceptionFilter)
export class PublicWorksController {
  private readonly visitorBffSecretDigest: Buffer;

  constructor(
    private readonly publication: PublicationService,
    private readonly attributionRemoval: AttributionRemovalService,
    config: ConfigService,
  ) {
    this.visitorBffSecretDigest = digest(config.getOrThrow<string>('VISITOR_BFF_SECRET'));
  }

  @Get(':workPublicId')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60')
  getWork(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Tag', `showcase-catalog,showcase-work-${workPublicId}`);
    return this.publication.getPublicWork(workPublicId);
  }

  @Post(':workPublicId/attributions/:attributionPublicId/removal-requests')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  createAttributionRemovalRequest(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Param('attributionPublicId', new ParseUUIDPipe({ version: '4' })) attributionPublicId: string,
    @Body() input: CreateAttributionRemovalRequestDto,
    @Req() request: Request,
  ) {
    return this.attributionRemoval.createPublic({
      ...input,
      attributionPublicId,
      sourceAddress: this.sourceAddress(request),
      workPublicId,
    });
  }

  private sourceAddress(request: Request): string {
    const providedSecret = request.headers['x-visitor-bff-secret'];
    const sourceKey = request.headers['x-visitor-source-key'];
    if (
      typeof providedSecret === 'string' &&
      typeof sourceKey === 'string' &&
      /^[0-9a-f]{64}$/u.test(sourceKey) &&
      timingSafeEqual(this.visitorBffSecretDigest, digest(providedSecret))
    ) {
      return `visitor-bff:${sourceKey}`;
    }
    return request.ip ?? 'unknown';
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

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
