import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicCatalogCoreClient } from '@/lib/public-catalog-core';
import { GET } from './route';

describe('public sitemap shard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders only Core-authorized public entity entries', async () => {
    vi.spyOn(PublicCatalogCoreClient.prototype, 'listSitemapEntries').mockResolvedValue([
      { lastModified: '2026-08-26T08:00:00.000Z', publicId: id(1) },
    ]);
    const response = await GET(new Request('https://showcase.example.test/sitemaps/works/99'), {
      params: Promise.resolve({ bucket: '99', kind: 'works' }),
    });
    const body = await response.text();
    expect(body).toContain(`https://showcase.example.test/works/${id(1)}`);
    expect(body).toContain('<lastmod>2026-08-26T08:00:00.000Z</lastmod>');
    expect(body).not.toMatch(/studentId|personId|accountId/iu);
    expect(response.headers.get('etag')).not.toBeNull();
  });

  it('rejects invalid or unbounded shard routes', async () => {
    const response = await GET(new Request('https://showcase.example.test/sitemaps/works/all'), {
      params: Promise.resolve({ bucket: 'all', kind: 'works' }),
    });
    expect(response.status).toBe(404);
  });
});

function id(index: number): string {
  return `99000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
