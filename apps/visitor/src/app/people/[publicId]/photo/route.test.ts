import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicProfileCoreClient } from '@/lib/public-profile-core';
import { GET } from './route';

const PUBLIC_ID = '82000000-0000-4000-8000-000000000001';

describe('public profile photo route', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not load media when consent eligibility is absent', async () => {
    const getPhotoUrl = vi
      .spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl')
      .mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(404);
    expect(getPhotoUrl).toHaveBeenCalledWith(PUBLIC_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns not-found instead of crashing when the upstream fetch rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockResolvedValue(
      'https://media.example.test/profile-media/photo.webp',
    );
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('serves only bounded sanitized WebP after rechecking consent', async () => {
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockResolvedValue(
      'https://media.example.test/profile-media/photo.webp',
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/webp' },
      }),
    );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=300');
    expect(response.headers.get('etag')).toEqual(expect.any(String));
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });
});
