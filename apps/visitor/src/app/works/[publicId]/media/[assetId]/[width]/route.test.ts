import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicWorkCoreClient } from '@/lib/public-work-core';
import { GET } from './route';

const WORK_PUBLIC_ID = '88000000-0000-4000-8000-000000000001';
const ASSET_ID = '88000000-0000-4000-8000-000000000002';

describe('published Work media route', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves only a bounded eligible processed WebP with five-minute shared caching', async () => {
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://r2.example.test/signed-public-media',
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp' } }),
    );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=300');
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('etag')).toEqual(expect.any(String));
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });

  it('uses uniform not-found without loading R2 when publication eligibility is absent', async () => {
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops reading a variant that exceeds the public media limit', async () => {
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://media.example.test/oversized.webp',
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(5 * 1_024 * 1_024 + 1), {
        headers: { 'Content-Type': 'image/webp' },
      }),
    );
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });
    expect(response.status).toBe(404);
  });
});
