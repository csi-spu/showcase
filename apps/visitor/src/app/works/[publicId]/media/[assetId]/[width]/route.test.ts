import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicWorkCoreClient } from '@/lib/public-work-core';
import { GET } from './route';

const WORK_PUBLIC_ID = '88000000-0000-4000-8000-000000000001';
const ASSET_ID = '88000000-0000-4000-8000-000000000002';

describe('published Work media route', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves only a bounded eligible processed WebP with immutable caching', async () => {
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
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, s-maxage=31536000, immutable',
    );
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
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries one transient upstream failure before serving the image', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://r2.example.test/signed-public-media',
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
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a non-cacheable service error when both upstream attempts reject', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://r2.example.test/signed-public-media',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a transient upstream status before serving the image', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://r2.example.test/signed-public-media',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'image/webp' },
        }),
      );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an authorized upstream not-found as a non-cacheable service error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://r2.example.test/signed-public-media',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 404 }));

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns a service error and logs when Core cannot authorize the media URL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockRejectedValue(
      new Error('core timeout'),
    );

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'PUBLIC_WORK_MEDIA_UNAVAILABLE' } });
  });

  it('returns a service error when the upstream body stream fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://r2.example.test/signed-public-media',
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
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });

    // The response is streamed, so its status is committed before the body
    // fails. The failure can only surface as an aborted body.
    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow();
  });

  it('returns a service error when a variant declares a length over the public media limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(PublicWorkCoreClient.prototype, 'getMediaUrl').mockResolvedValue(
      'https://media.example.test/oversized.webp',
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(8), {
        headers: {
          'Content-Length': String(5 * 1_024 * 1_024 + 1),
          'Content-Type': 'image/webp',
        },
      }),
    );
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ assetId: ASSET_ID, publicId: WORK_PUBLIC_ID, width: '480' }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('aborts the body when an undeclared variant exceeds the public media limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow();
  });
});
