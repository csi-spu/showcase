import 'server-only';
import { z } from 'zod';

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

const posterSchema = z
  .object({
    assetId: z.uuid(),
    dominantColor: z.string().regex(/^#[0-9A-F]{6}$/i),
    height: z.number().int().positive(),
    variants: z
      .array(
        z
          .object({ height: z.number().int().positive(), width: z.number().int().positive() })
          .strict(),
      )
      .min(1),
    width: z.number().int().positive(),
  })
  .strict();
const tagSchema = z
  .object({
    activeWorkCount: z.number().int().nonnegative(),
    displayLabel: z.string().min(1).max(50),
    publicId: z.uuid(),
  })
  .strict();
const workCardSchema = z
  .object({
    academicPeriod: z
      .object({ semester: z.enum(['1', '2', 'summer']), year: z.number().int() })
      .strict(),
    attributions: z.array(z.string().min(1).max(100)).max(21),
    category: z.enum(['course_work', 'competition_entry', 'academic_article']),
    poster: posterSchema.nullable(),
    publishedAt: z.iso.datetime(),
    summary: z.string().min(1).max(300),
    tags: z.array(z.object({ displayLabel: z.string(), publicId: z.uuid() }).strict()).max(5),
    title: z.string().min(1).max(150),
    workPublicId: z.uuid(),
  })
  .strict();
const personCardSchema = z
  .object({
    bio: z.string().max(500).nullable(),
    entryYear: z.number().int(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    photo: z
      .object({
        height: z.number().int().positive(),
        url: z.url(),
        width: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    publicId: z.uuid(),
    publishedWorkCount: z.number().int().nonnegative(),
  })
  .strict();

const pageSchema = <T extends z.ZodType>(item: T) =>
  z
    .object({
      hasNextPage: z.boolean(),
      items: z.array(item).max(48),
      nextCursor: z.string().min(1).nullable(),
    })
    .strict();

const workPageSchema = pageSchema(workCardSchema);
const peoplePageSchema = pageSchema(personCardSchema);
const catalogFilterOptionsSchema = z
  .object({
    entryYears: z.array(z.number().int().min(2400).max(2700)).max(301),
    workYears: z.array(z.number().int().min(2400).max(2700)).max(301),
  })
  .strict();
const sitemapEntrySchema = z
  .object({ lastModified: z.iso.datetime().nullable(), publicId: z.uuid() })
  .strict();

export type WorkCatalogCard = z.infer<typeof workCardSchema>;
export type PeopleCatalogCard = z.infer<typeof personCardSchema>;
export type PublicTag = z.infer<typeof tagSchema>;
export type WorkCatalogPage = z.infer<typeof workPageSchema>;
export type PeopleCatalogPage = z.infer<typeof peoplePageSchema>;
export type CatalogSitemapEntry = z.infer<typeof sitemapEntrySchema>;
export type CatalogFilterOptions = z.infer<typeof catalogFilterOptionsSchema>;

export class PublicCatalogCoreClient {
  private readonly coreOrigin: string;

  constructor(
    coreUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.coreOrigin = new URL(coreUrl).origin;
  }

  async listWorks(params: CatalogSearchParams): Promise<WorkCatalogPage> {
    const url = this.url('/v1/public/works', params, [
      'category',
      'cursor',
      'limit',
      'profile',
      'q',
      'semester',
      'sort',
      'tag',
      'year',
    ]);
    const response = await this.fetchImpl(
      url,
      this.fetchOptions(params, ['showcase-catalog', 'showcase-catalog-works']),
    );
    if (!response.ok) throw new Error('PUBLIC_CATALOG_SERVICE_UNAVAILABLE');
    return workPageSchema.parse(await response.json());
  }

  async listPeople(params: CatalogSearchParams): Promise<PeopleCatalogPage> {
    const url = this.url('/v1/public/people', params, [
      'cursor',
      'entryYear',
      'limit',
      'q',
      'sort',
    ]);
    const response = await this.fetchImpl(
      url,
      this.fetchOptions(params, ['showcase-catalog', 'showcase-catalog-people']),
    );
    if (!response.ok) throw new Error('PUBLIC_CATALOG_SERVICE_UNAVAILABLE');
    return peoplePageSchema.parse(await response.json());
  }

  async listPopularTags(): Promise<PublicTag[]> {
    const response = await this.fetchImpl(this.url('/v1/public/tags/popular', {}, []), {
      credentials: 'omit',
      headers: { accept: 'application/json' },
      next: {
        revalidate: 60,
        tags: ['showcase-catalog', 'showcase-catalog-tags'],
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('PUBLIC_CATALOG_SERVICE_UNAVAILABLE');
    return z
      .array(tagSchema)
      .max(20)
      .parse(await response.json());
  }

  async listFilterOptions(): Promise<CatalogFilterOptions> {
    const response = await this.fetchImpl(this.url('/v1/public/filter-options', {}, []), {
      credentials: 'omit',
      headers: { accept: 'application/json' },
      next: {
        revalidate: 60,
        tags: ['showcase-catalog', 'showcase-catalog-works', 'showcase-catalog-people'],
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('PUBLIC_CATALOG_SERVICE_UNAVAILABLE');
    return catalogFilterOptionsSchema.parse(await response.json());
  }

  async getTag(publicId: string): Promise<PublicTag | null> {
    const response = await this.fetchImpl(
      this.url(`/v1/public/tags/${encodeURIComponent(publicId)}`, {}, []),
      {
        credentials: 'omit',
        headers: { accept: 'application/json' },
        next: {
          revalidate: 60,
          tags: ['showcase-catalog', 'showcase-catalog-tags', `showcase-tag-${publicId}`],
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('PUBLIC_CATALOG_SERVICE_UNAVAILABLE');
    return tagSchema.parse(await response.json());
  }

  async listSitemapEntries(
    kind: 'people' | 'tags' | 'works',
    bucket: string,
  ): Promise<CatalogSitemapEntry[]> {
    const response = await this.fetchImpl(
      this.url(`/v1/public/sitemap/${kind}/${encodeURIComponent(bucket)}`, {}, []),
      {
        credentials: 'omit',
        headers: { accept: 'application/json' },
        next: { revalidate: 60, tags: ['showcase-sitemap'] },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) throw new Error('PUBLIC_CATALOG_SERVICE_UNAVAILABLE');
    return z
      .array(sitemapEntrySchema)
      .max(50_000)
      .parse(await response.json());
  }

  private fetchOptions(
    params: CatalogSearchParams,
    cacheTags: string[],
  ): RequestInit & { next?: { revalidate: number; tags: string[] } } {
    const tags = values(params.tag);
    const isNoStore =
      values(params.cursor).length > 0 ||
      values(params.profile).some(Boolean) ||
      values(params.q).some(Boolean) ||
      tags.length > 1;
    return {
      ...(isNoStore
        ? { cache: 'no-store' as const }
        : { next: { revalidate: 60, tags: cacheTags } }),
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    };
  }

  private url(path: string, params: CatalogSearchParams, allowed: string[]): string {
    const url = new URL(path, this.coreOrigin);
    for (const key of allowed) {
      for (const value of values(params[key])) url.searchParams.append(key, value);
    }
    return url.toString();
  }
}

function values(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
