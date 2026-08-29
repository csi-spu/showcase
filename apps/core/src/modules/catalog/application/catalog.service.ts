import { Inject, Injectable } from '@nestjs/common';
import { CatalogCursorCodec, CatalogCursorError } from '../domain/catalog-cursor';
import {
  CatalogQueryError,
  normalizePeopleCatalogQuery,
  normalizeTagSuggestionQuery,
  normalizeWorkCatalogQuery,
  type RawPeopleCatalogQuery,
  type RawWorkCatalogQuery,
} from '../domain/catalog-query-policy';
import {
  CATALOG_CURSOR_CODEC,
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
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repository: CatalogRepository,
    @Inject(CATALOG_CURSOR_CODEC) private readonly cursorCodec: CatalogCursorCodec,
  ) {}

  async listWorks(rawQuery: RawWorkCatalogQuery, cursor: string | undefined) {
    try {
      const query = normalizeWorkCatalogQuery(rawQuery);
      const after = cursor === undefined ? null : this.cursorCodec.decode('works', query, cursor);
      const slice = await this.repository.listWorks({ after, query });
      return this.page('works', query, slice, query.limit);
    } catch (error: unknown) {
      this.rethrowValidation(error);
    }
  }

  async listPeople(rawQuery: RawPeopleCatalogQuery, cursor: string | undefined) {
    try {
      const query = normalizePeopleCatalogQuery(rawQuery);
      const after = cursor === undefined ? null : this.cursorCodec.decode('people', query, cursor);
      const slice = await this.repository.listPeople({ after, query });
      return this.page('people', query, slice, query.limit);
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

  private page<TItem>(
    collection: 'people' | 'works',
    query: object,
    slice: CatalogSlice<TItem>,
    limit: number,
  ) {
    const visible = slice.entries.slice(0, limit);
    const hasNextPage = slice.entries.length > limit;
    const last = visible.at(-1);
    return {
      hasNextPage,
      items: visible.map((entry) => entry.item),
      nextCursor:
        hasNextPage && last !== undefined
          ? this.cursorCodec.encode(collection, query, last.position)
          : null,
    };
  }

  private rethrowValidation(error: unknown): never {
    if (error instanceof CatalogCursorError || error instanceof CatalogQueryError) {
      throw new CatalogError(error.code, 400);
    }
    throw error;
  }
}

export function isCatalogSharedCacheEligible(input: {
  cursor: string | null;
  profilePublicId: string | null;
  query: string | null;
  tagCount: number;
}): boolean {
  return (
    input.cursor === null &&
    input.profilePublicId === null &&
    input.query === null &&
    input.tagCount <= 1
  );
}
