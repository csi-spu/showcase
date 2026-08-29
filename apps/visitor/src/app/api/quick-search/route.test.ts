import { describe, expect, it, vi } from 'vitest';
import { createQuickSearchHandler } from './route';

describe('Visitor quick search route', () => {
  it('defers production Core configuration until request handling', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORE_URL', undefined);

    try {
      const route = await import('./route');

      expect(route.GET).toEqual(expect.any(Function));
      const response = await route.GET(
        new Request('http://localhost/api/quick-search?q=portfolio'),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: { code: 'QUICK_SEARCH_UNAVAILABLE' },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns bounded public People and Work matches without leaking catalog details', async () => {
    const listPeople = vi.fn().mockResolvedValue({
      hasNextPage: false,
      items: [
        {
          bio: 'สนใจระบบเว็บ',
          entryYear: 2566,
          firstName: 'อริสา',
          lastName: 'ใจดี',
          photo: null,
          publicId: '10000000-0000-4000-8000-000000000001',
          publishedWorkCount: 2,
        },
      ],
      nextCursor: null,
    });
    const listWorks = vi.fn().mockResolvedValue({
      hasNextPage: false,
      items: [
        {
          academicPeriod: { semester: '1', year: 2567 },
          attributions: ['อริสา ใจดี'],
          category: 'course_work',
          poster: null,
          publishedAt: '2026-08-01T00:00:00.000Z',
          summary: 'ข้อมูลที่ quick search ไม่ต้องส่งกลับ',
          tags: [],
          title: 'ระบบจัดการห้องเรียน',
          workPublicId: '20000000-0000-4000-8000-000000000002',
        },
      ],
      nextCursor: null,
    });
    const handler = createQuickSearchHandler({ listPeople, listWorks });

    const response = await handler(
      new Request(
        'http://localhost/api/quick-search?q=%E0%B8%AD%E0%B8%A3%E0%B8%B4%E0%B8%AA%E0%B8%B2',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      people: [
        {
          entryYear: 2566,
          name: 'อริสา ใจดี',
          publicId: '10000000-0000-4000-8000-000000000001',
        },
      ],
      works: [
        {
          attribution: 'อริสา ใจดี',
          publicId: '20000000-0000-4000-8000-000000000002',
          title: 'ระบบจัดการห้องเรียน',
        },
      ],
    });
    expect(listPeople).toHaveBeenCalledWith({ limit: '5', q: 'อริสา' });
    expect(listWorks).toHaveBeenCalledWith({ limit: '5', q: 'อริสา' });
  });

  it.each(['', 'a', 'a'.repeat(101)])('rejects an invalid query length', async (query) => {
    const handler = createQuickSearchHandler({
      listPeople: vi.fn(),
      listWorks: vi.fn(),
    });

    const response = await handler(
      new Request(`http://localhost/api/quick-search?q=${encodeURIComponent(query)}`),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: { code: 'QUICK_SEARCH_QUERY_INVALID' } });
  });

  it('returns a stable unavailable response when Core cannot be reached', async () => {
    const handler = createQuickSearchHandler({
      listPeople: vi.fn().mockRejectedValue(new Error('unavailable')),
      listWorks: vi.fn().mockRejectedValue(new Error('unavailable')),
    });

    const response = await handler(new Request('http://localhost/api/quick-search?q=portfolio'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'QUICK_SEARCH_UNAVAILABLE' } });
  });
});
