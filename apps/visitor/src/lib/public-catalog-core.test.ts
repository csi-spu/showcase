import { describe, expect, it, vi } from 'vitest';
import { PublicCatalogCoreClient } from './public-catalog-core';

describe('PublicCatalogCoreClient', () => {
  it('requests canonical repeated filters without credentials and validates the public projection', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(Response.json(workPage())));
    const client = new PublicCatalogCoreClient('https://core.example.test', fetchMock);
    await expect(
      client.listWorks({
        category: ['course_work', 'academic_article'],
        limit: '24',
        tag: [id(2), id(3)],
      }),
    ).resolves.toEqual(workPage());

    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/v1/public/works');
    expect(parsed.searchParams.getAll('category')).toEqual(['course_work', 'academic_article']);
    expect(parsed.searchParams.getAll('tag')).toEqual([id(2), id(3)]);
    expect(init?.credentials).toBe('omit');
    expect(init?.cache).toBe('no-store');
  });

  it('revalidates bounded first pages while bypassing cache for search and cursors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(Response.json(workPage())));
    const client = new PublicCatalogCoreClient('https://core.example.test', fetchMock);
    await client.listWorks({ limit: '12', sort: 'recent' });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ next: { revalidate: 60 } });

    await client.listWorks({ q: 'react' });
    expect(fetchMock.mock.calls[1]?.[1]?.cache).toBe('no-store');

    await client.listWorks({ limit: '6', profile: id(4), sort: 'recent' });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(`profile=${id(4)}`);
    expect(fetchMock.mock.calls[2]?.[1]?.cache).toBe('no-store');
  });

  it('validates the consented Public Profile bio in People catalog cards', async () => {
    const page = {
      hasNextPage: false,
      items: [
        {
          bio: 'สนใจการออกแบบประสบการณ์ที่ใช้งานง่าย',
          entryYear: 2566,
          firstName: 'อริสา',
          lastName: 'ใจดี',
          photo: null,
          publicId: id(4),
          publishedWorkCount: 2,
        },
      ],
      nextCursor: null,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(page));

    await expect(
      new PublicCatalogCoreClient('https://core.example.test', fetchMock).listPeople({}),
    ).resolves.toEqual(page);
  });

  it('rejects accidental private or full Revision fields', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...workPage(),
        items: [{ ...workPage().items[0], description: 'private full field' }],
      }),
    );
    await expect(
      new PublicCatalogCoreClient('https://core.example.test', fetchMock).listWorks({}),
    ).rejects.toThrow();
  });

  it('loads a bounded sitemap shard through the public Core contract', async () => {
    const entries = [{ lastModified: null, publicId: id(1) }];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(entries));
    await expect(
      new PublicCatalogCoreClient('https://core.example.test', fetchMock).listSitemapEntries(
        'works',
        '99',
      ),
    ).resolves.toEqual(entries);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://core.example.test/v1/public/sitemap/works/99',
    );
  });

  it('loads cacheable filter years from the public Core contract', async () => {
    const options = { entryYears: [2569, 2568], workYears: [2569, 2567] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(options));

    await expect(
      new PublicCatalogCoreClient('https://core.example.test', fetchMock).listFilterOptions(),
    ).resolves.toEqual(options);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://core.example.test/v1/public/filter-options',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ next: { revalidate: 60 } });
  });
});

function workPage() {
  return {
    hasNextPage: false,
    items: [
      {
        academicPeriod: { semester: '1', year: 2569 },
        attributions: ['ผู้สร้าง'],
        category: 'course_work',
        poster: null,
        publishedAt: '2026-08-26T08:00:00.000Z',
        summary: 'สรุป',
        tags: [{ displayLabel: 'React', publicId: id(2) }],
        title: 'ผลงาน',
        workPublicId: id(1),
      },
    ],
    nextCursor: null,
  };
}

function id(index: number): string {
  return `99000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
