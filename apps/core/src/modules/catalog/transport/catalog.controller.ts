import { Controller, Get, Param, ParseUUIDPipe, Query, Req, Res, UseFilters } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  CatalogError,
  CatalogService,
  isCatalogSharedCacheEligible,
} from '../application/catalog.service';
import {
  normalizePeopleCatalogQuery,
  normalizeWorkCatalogQuery,
} from '../domain/catalog-query-policy';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { PeopleCatalogQueryDto, WorkCatalogQueryDto } from './catalog.dto';
import type { CatalogSitemapKind } from '../application/catalog.ports';

const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=60';
const PRIVATE_CACHE_CONTROL = 'private, no-store';

@Controller('public')
@UseFilters(CatalogExceptionFilter)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('works')
  async listWorks(
    @Query() input: WorkCatalogQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const cursor = scalarCursor(input.cursor);
    const rawQuery = workQueryWithoutCursor(input);
    const page = await this.catalog.listWorks(rawQuery, cursor ?? undefined);
    const normalized = normalizeWorkCatalogQuery(rawQuery);
    return respond(
      request,
      response,
      page,
      isCatalogSharedCacheEligible({
        cursor,
        query: normalized.query,
        tagCount: normalized.tagPublicIds.length,
      }),
      ['showcase-catalog', 'showcase-catalog-works'],
    );
  }

  @Get('people')
  async listPeople(
    @Query() input: PeopleCatalogQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const cursor = scalarCursor(input.cursor);
    const rawQuery = peopleQueryWithoutCursor(input);
    const page = await this.catalog.listPeople(rawQuery, cursor ?? undefined);
    const normalized = normalizePeopleCatalogQuery(rawQuery);
    return respond(
      request,
      response,
      page,
      isCatalogSharedCacheEligible({
        cursor,
        query: normalized.query,
        tagCount: 0,
      }),
      ['showcase-catalog', 'showcase-catalog-people'],
    );
  }

  @Get('tags/popular')
  async listPopularTags(@Req() request: Request, @Res() response: Response) {
    return respond(request, response, await this.catalog.listPopularTags(), true, [
      'showcase-catalog',
      'showcase-catalog-tags',
    ]);
  }

  @Get('tags/:publicId')
  async getTag(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return respond(request, response, await this.catalog.getTag(publicId), true, [
      'showcase-catalog',
      'showcase-catalog-tags',
      `showcase-tag-${publicId}`,
    ]);
  }

  @Get('sitemap/:kind/:bucket')
  async listSitemapEntries(
    @Param('kind') rawKind: string,
    @Param('bucket') rawBucket: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const kind = sitemapKind(rawKind);
    const bucket = sitemapBucket(rawBucket);
    return respond(request, response, await this.catalog.listSitemapEntries(kind, bucket), true, [
      'showcase-sitemap',
    ]);
  }
}

function sitemapKind(value: string): CatalogSitemapKind {
  if (value === 'people' || value === 'tags' || value === 'works') return value;
  throw new CatalogError('CATALOG_SITEMAP_KIND_INVALID', 400);
}

function sitemapBucket(value: string): number {
  if (!/^[0-9a-f]{2}$/u.test(value)) {
    throw new CatalogError('CATALOG_SITEMAP_BUCKET_INVALID', 400);
  }
  return Number.parseInt(value, 16);
}

function scalarCursor(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value) || value.length === 0) {
    throw new CatalogError('CATALOG_CURSOR_INVALID', 400);
  }
  return value;
}

function workQueryWithoutCursor(input: WorkCatalogQueryDto) {
  return {
    category: input.category,
    limit: input.limit,
    q: input.q,
    semester: input.semester,
    sort: input.sort,
    tag: input.tag,
    year: input.year,
  };
}

function peopleQueryWithoutCursor(input: PeopleCatalogQueryDto) {
  return {
    entryYear: input.entryYear,
    limit: input.limit,
    q: input.q,
    sort: input.sort,
  };
}

function respond<T>(
  request: Request,
  response: Response,
  body: T,
  isSharedCacheEligible: boolean,
  cacheTags: string[],
): void {
  response.setHeader(
    'Cache-Control',
    isSharedCacheEligible ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL,
  );
  if (!isSharedCacheEligible) {
    response.json(body);
    return;
  }
  response.setHeader('Cache-Tag', cacheTags.join(','));
  const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('base64url')}"`;
  response.setHeader('ETag', etag);
  if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
    response.status(304).end();
    return;
  }
  response.json(body);
}

function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag || value === `W/${etag}`);
}
