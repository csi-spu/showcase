import { Inject, Injectable } from '@nestjs/common';
import {
  CatalogQueryError,
  normalizePeopleCatalogQuery,
  normalizeTagSuggestionQuery,
  normalizeWorkCatalogQuery,
  type RawPeopleCatalogQuery,
  type RawWorkCatalogQuery,
} from '../domain/catalog-query-policy';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
  type CatalogSitemapKind,
  type CatalogSlice,
} from './catalog.ports';

export class CatalogError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'CatalogError';
  }
}

@Injectable()
export class CatalogService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repository: CatalogRepository) {}

  async listWorks(rawQuery: RawWorkCatalogQuery) {
    try {
      const query = normalizeWorkCatalogQuery(rawQuery);
      const slice = await this.repository.listWorks({ query });
      return this.page(query, slice);
    } catch (error: unknown) {
      this.rethrowValidation(error);
    }
  }

  async listPeople(rawQuery: RawPeopleCatalogQuery) {
    try {
      const query = normalizePeopleCatalogQuery(rawQuery);
      const slice = await this.repository.listPeople({ query });
      return this.page(query, slice);
    } catch (error: unknown) {
      this.rethrowValidation(error);
    }
  }

  async listPopularTags() {
    return this.repository.listPopularTags();
  }

  async listFilterOptions() {
    return this.repository.listFilterOptions();
  }

  async suggestTags(rawQuery: string | string[] | undefined) {
    try {
      return await this.repository.suggestTags(normalizeTagSuggestionQuery(rawQuery));
    } catch (error: unknown) {
      this.rethrowValidation(error);
    }
  }

  async getCacheVersion() {
    return { version: await this.repository.getCacheVersion() };
  }

  async getTag(publicId: string) {
    const tag = await this.repository.findTag(publicId);
    if (tag === null || tag.activeWorkCount === 0) {
      throw new CatalogError('PUBLIC_TAG_NOT_FOUND', 404);
    }
    return tag;
  }

  async listSitemapEntries(kind: CatalogSitemapKind, bucket: number) {
    if (!Number.isInteger(bucket) || bucket < 0 || bucket > 255) {
      throw new CatalogError('CATALOG_SITEMAP_BUCKET_INVALID', 400);
    }
    return this.repository.listSitemapEntries(kind, bucket);
  }

  // A page beyond totalPages is a normal, valid request: it returns empty items, not an error.
  private page<TItem>(query: { limit: number; page: number }, slice: CatalogSlice<TItem>) {
    const totalPages = Math.max(1, Math.ceil(slice.totalCount / query.limit));
    return {
      items: slice.items,
      page: query.page,
      pageSize: query.limit,
      totalCount: slice.totalCount,
      totalPages,
      // Transitional fields for PR1-relaxed visitor pods still running old code; remove once PR2 is confirmed stable.
      hasNextPage: query.page < totalPages,
      nextCursor: null,
    };
  }

  private rethrowValidation(error: unknown): never {
    if (error instanceof CatalogQueryError) {
      throw new CatalogError(error.code, 400);
    }
    throw error;
  }
}

export function isCatalogSharedCacheEligible(input: {
  profilePublicId: string | null;
  query: string | null;
  tagCount: number;
}): boolean {
  return input.profilePublicId === null && input.query === null && input.tagCount <= 1;
}
