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
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(getPhotoUrl).toHaveBeenCalledWith(PUBLIC_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries one transient upstream failure before serving the photo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockResolvedValue(
      'https://media.example.test/profile-media/photo.webp',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new DOMException('connection reset', 'NetworkError'))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'image/webp' },
        }),
      );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a non-cacheable service error when both upstream attempts reject', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockResolvedValue(
      'https://media.example.test/profile-media/photo.webp',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a service error when Core cannot authorize the photo URL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockRejectedValue(
      new Error('core timeout'),
    );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'PUBLIC_PROFILE_PHOTO_UNAVAILABLE' } });
  });

  it('aborts the streamed photo when the upstream body fails while reading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockResolvedValue(
      'https://media.example.test/profile-media/photo.webp',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.error(new Error('stream failed'));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { headers: { 'Content-Type': 'image/webp' } }),
    );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    // Streaming commits the status before the body fails, so the failure can
    // only surface as an aborted body.
    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow();
  });

  it('serves only bounded sanitized WebP after rechecking consent', async () => {
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockResolvedValue(
      'https://media.example.test/profile-media/photo.webp',
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { ETag: '"upstream-photo"', 'Content-Type': 'image/webp' },
      }),
    );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(200);
    // This URL has no version segment, so the photo must stay revalidatable
    // rather than immutable.
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    );
    expect(response.headers.get('etag')).toBe('"upstream-photo"');
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });

  it('revalidates with the upstream entity tag', async () => {
    vi.spyOn(PublicProfileCoreClient.prototype, 'getPhotoUrl').mockResolvedValue(
      'https://media.example.test/profile-media/photo.webp',
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { ETag: '"upstream-photo"', 'Content-Type': 'image/webp' },
      }),
    );

    const response = await GET(
      new Request('http://localhost', { headers: { 'if-none-match': '"upstream-photo"' } }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    );

    expect(response.status).toBe(304);
  });
});
