import { z } from 'zod';
import { getVisitorCoreUrl, PublicProfileCoreClient } from '@/lib/public-profile-core';

const MAX_SANITIZED_PHOTO_BYTES = 8 * 1_024 * 1_024;
// This URL carries no asset version, so a replaced photo reuses it. The cache
// window stays short enough that a new photo appears without a purge; it must
// not become `immutable` until the path includes a version segment.
const PHOTO_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';
const MAX_FETCH_ATTEMPTS = 2;
const RETRY_DELAY_MIN_MS = 100;
const RETRY_JITTER_MS = 100;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await params;
  if (!z.uuid().safeParse(publicId).success) return notFound();
  let photoUrl: string | null;
  try {
    photoUrl = await new PublicProfileCoreClient(getVisitorCoreUrl()).getPhotoUrl(publicId);
  } catch (error) {
    console.error('PUBLIC_PROFILE_PHOTO_URL_FAILED', {
      errorName: safeErrorName(error),
      publicId,
    });
    return unavailable();
  }
  if (photoUrl === null) return notFound();

  const photo = await fetchPhoto(photoUrl, publicId);
  if (photo === null) return unavailable();
  // The upstream ETag tracks the stored object, so a replaced photo revalidates
  // correctly. Without one the response is still cacheable for the window above.
  const etag = photo.etag;
  if (etag !== null && request.headers.get('if-none-match') === etag) {
    await photo.body.cancel().catch(() => undefined);
    return new Response(null, {
      headers: { 'Cache-Control': PHOTO_CACHE_CONTROL, ETag: etag },
      status: 304,
    });
  }
  return new Response(photo.body, {
    headers: {
      'Cache-Control': PHOTO_CACHE_CONTROL,
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      ...(etag === null ? {} : { ETag: etag }),
      ...(photo.contentLength === null ? {} : { 'Content-Length': photo.contentLength }),
    },
  });
}

async function fetchPhoto(
  url: string,
  publicId: string,
): Promise<{
  body: ReadableStream<Uint8Array>;
  contentLength: string | null;
  etag: string | null;
} | null> {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { accept: 'image/webp' },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.warn('PUBLIC_PROFILE_PHOTO_RETRY', {
          attempt,
          publicId,
          reason: 'fetch_failed',
        });
        await waitBeforeRetry();
        continue;
      }
      console.error('PUBLIC_PROFILE_PHOTO_FETCH_FAILED', {
        errorName: safeErrorName(error),
        publicId,
      });
      return null;
    }

    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      if (isRetryableStatus(upstream.status) && attempt < MAX_FETCH_ATTEMPTS) {
        console.warn('PUBLIC_PROFILE_PHOTO_RETRY', {
          attempt,
          publicId,
          reason: 'upstream_status',
          status: upstream.status,
        });
        await waitBeforeRetry();
        continue;
      }
      console.error('PUBLIC_PROFILE_PHOTO_UPSTREAM_FAILED', {
        publicId,
        status: upstream.status,
      });
      return null;
    }

    const declaredLength = Number(upstream.headers.get('content-length'));
    if (
      !upstream.headers.get('content-type')?.toLowerCase().startsWith('image/webp') ||
      (Number.isFinite(declaredLength) && declaredLength > MAX_SANITIZED_PHOTO_BYTES)
    ) {
      await upstream.body?.cancel().catch(() => undefined);
      console.error('PUBLIC_PROFILE_PHOTO_RESPONSE_INVALID', { publicId });
      return null;
    }

    if (upstream.body === null) {
      console.error('PUBLIC_PROFILE_PHOTO_RESPONSE_INVALID', { publicId });
      return null;
    }
    // Streamed straight to the client so a photo never lands in this
    // container's heap; a mid-stream failure can no longer be retried.
    return {
      body: boundedStream(upstream.body, MAX_SANITIZED_PHOTO_BYTES, () => {
        console.error('PUBLIC_PROFILE_PHOTO_BODY_FAILED', { publicId });
      }),
      contentLength:
        Number.isFinite(declaredLength) && declaredLength > 0 ? String(declaredLength) : null,
      etag: upstream.headers.get('etag'),
    };
  }
  return null;
}

function boundedStream(
  source: ReadableStream<Uint8Array>,
  maximumBytes: number,
  onOverflow: () => void,
): ReadableStream<Uint8Array> {
  let byteLength = 0;
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        byteLength += chunk.byteLength;
        if (byteLength > maximumBytes) {
          onOverflow();
          controller.error(new Error('PHOTO_TOO_LARGE'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function waitBeforeRetry(): Promise<void> {
  const delay = RETRY_DELAY_MIN_MS + Math.floor(Math.random() * (RETRY_JITTER_MS + 1));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 100) : 'UnknownError';
}

function notFound(): Response {
  return Response.json(
    { error: { code: 'PUBLIC_PROFILE_NOT_FOUND' } },
    { headers: { 'Cache-Control': 'private, no-store' }, status: 404 },
  );
}

function unavailable(): Response {
  return Response.json(
    { error: { code: 'PUBLIC_PROFILE_PHOTO_UNAVAILABLE' } },
    { headers: { 'Cache-Control': 'private, no-store' }, status: 503 },
  );
}
