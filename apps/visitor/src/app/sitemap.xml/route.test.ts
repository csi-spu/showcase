import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('public sitemap index', () => {
  it('publishes bounded entity shards using the request origin', async () => {
    const response = GET(new Request('https://showcase.example.test/sitemap.xml'));
    const body = await response.text();
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(body.match(/<sitemap>/g)).toHaveLength(769);
    expect(body).toContain('https://showcase.example.test/sitemaps/base/00');
    expect(body).toContain('https://showcase.example.test/sitemaps/works/ff');
    const etag = response.headers.get('etag');
    expect(etag).not.toBeNull();
    expect(
      GET(
        new Request('https://showcase.example.test/sitemap.xml', {
          headers: { 'if-none-match': etag ?? '' },
        }),
      ).status,
    ).toBe(304);
  });
});
