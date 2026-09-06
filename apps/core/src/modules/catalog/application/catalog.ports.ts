import type { PeopleCatalogQuery, WorkCatalogQuery } from '../domain/catalog-query-policy';

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface CatalogSlice<TItem> {
  items: TItem[];
  totalCount: number;
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
  bio: string | null;
  entryYear: number;
  firstName: string;
  lastName: string;
  photo: { height: number; url: string; width: number } | null;
  publicId: string;
  publishedWorkCount: number;
}

export interface PublicTagView {
  activeWorkCount: number;
  displayLabel: string;
  publicId: string;
}

export interface CatalogFilterOptions {
  entryYears: number[];
  workYears: number[];
}

export type CatalogSitemapKind = 'people' | 'tags' | 'works';

export interface CatalogSitemapEntry {
  lastModified: string | null;
  publicId: string;
}

export interface CatalogRepository {
  findTag(publicId: string): Promise<PublicTagView | null>;
  getCacheVersion(): Promise<string>;
  listFilterOptions(): Promise<CatalogFilterOptions>;
  listPeople(input: { query: PeopleCatalogQuery }): Promise<CatalogSlice<PeopleCatalogCard>>;
  listPopularTags(): Promise<PublicTagView[]>;
  listSitemapEntries(kind: CatalogSitemapKind, bucket: number): Promise<CatalogSitemapEntry[]>;
  suggestTags(query: string): Promise<PublicTagView[]>;
  listWorks(input: { query: WorkCatalogQuery }): Promise<CatalogSlice<WorkCatalogCard>>;
}
