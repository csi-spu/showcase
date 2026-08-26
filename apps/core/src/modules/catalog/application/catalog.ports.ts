import type { PeopleCatalogQuery, WorkCatalogQuery } from '../domain/catalog-query-policy';

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');
export const CATALOG_CURSOR_CODEC = Symbol('CATALOG_CURSOR_CODEC');

export type CatalogPosition = Record<string, boolean | number | string | null>;

export interface CatalogSlice<TItem> {
  entries: Array<{ item: TItem; position: CatalogPosition }>;
}

export interface WorkCatalogCard {
  academicPeriod: { semester: '1' | '2' | 'summer'; year: number };
  attributions: string[];
  category: 'academic_article' | 'competition_entry' | 'course_work';
  poster: {
    assetId: string;
    dominantColor: string;
    height: number;
    variants: Array<{ height: number; width: number }>;
    width: number;
  } | null;
  publishedAt: string;
  summary: string;
  tags: Array<{ displayLabel: string; publicId: string }>;
  title: string;
  workPublicId: string;
}

export interface PeopleCatalogCard {
  displayName: string;
  entryYear: number;
  photo: { height: number; url: string; width: number } | null;
  publicId: string;
  publishedWorkCount: number;
}

export interface PublicTagView {
  activeWorkCount: number;
  displayLabel: string;
  publicId: string;
}

export type CatalogSitemapKind = 'people' | 'tags' | 'works';

export interface CatalogSitemapEntry {
  lastModified: string | null;
  publicId: string;
}

export interface CatalogRepository {
  findTag(publicId: string): Promise<PublicTagView | null>;
  getCacheVersion(): Promise<string>;
  listPeople(input: {
    after: CatalogPosition | null;
    query: PeopleCatalogQuery;
  }): Promise<CatalogSlice<PeopleCatalogCard>>;
  listPopularTags(): Promise<PublicTagView[]>;
  listSitemapEntries(kind: CatalogSitemapKind, bucket: number): Promise<CatalogSitemapEntry[]>;
  listWorks(input: {
    after: CatalogPosition | null;
    query: WorkCatalogQuery;
  }): Promise<CatalogSlice<WorkCatalogCard>>;
}
