import { ConfigService } from '@nestjs/config';
import { CloudflarePublicCacheInvalidator } from './cloudflare-public-cache.invalidator';

describe('CloudflarePublicCacheInvalidator', () => {
  afterEach(() => jest.restoreAllMocks());

  it('expires the Visitor origin cache before purging the same Cloudflare tags', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    const invalidator = new CloudflarePublicCacheInvalidator(
      new ConfigService({
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
        VISITOR_CACHE_SECRET: 'visitor-cache-secret-that-is-long-enough',
        VISITOR_URL: 'https://showcase.example.test',
      }),
    );

    await invalidator.invalidate(['showcase-catalog', `showcase-work-${id(1)}`]);

    expect(requestUrl(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://showcase.example.test/api/internal/cache/revalidate',
    );
    expect(JSON.parse(requestBody(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      tags: ['showcase-catalog', `showcase-work-${id(1)}`],
    });
    expect(requestUrl(fetchMock.mock.calls[1]?.[0])).toContain(
      '/zones/0123456789abcdef0123456789abcdef/purge_cache',
    );
  });

  it('does not purge the edge when Visitor revalidation fails', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }));
    const invalidator = new CloudflarePublicCacheInvalidator(
      new ConfigService({
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
        VISITOR_CACHE_SECRET: 'visitor-cache-secret-that-is-long-enough',
        VISITOR_URL: 'https://showcase.example.test',
      }),
    );
    await expect(invalidator.invalidate(['showcase-catalog'])).rejects.toMatchObject({
      code: 'VISITOR_CACHE_REVALIDATION_FAILED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function id(index: number): string {
  return `9d000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function requestUrl(input: string | URL | Request | undefined): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  throw new Error('EXPECTED_FETCH_URL');
}

function requestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== 'string') throw new Error('EXPECTED_STRING_BODY');
  return body;
}
