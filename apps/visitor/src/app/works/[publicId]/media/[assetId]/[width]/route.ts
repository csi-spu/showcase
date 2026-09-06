import { z } from 'zod';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicWorkCoreClient } from '@/lib/public-work-core';

const MAX_MEDIA_BYTES = 5 * 1_024 * 1_024;
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';
const MAX_FETCH_ATTEMPTS = 2;
const RETRY_DELAY_MIN_MS = 100;
const RETRY_JITTER_MS = 100;
const paramsSchema = z.object({
  assetId: z.uuid(),
  publicId: z.uuid(),
  width: z.coerce.number().int().positive().max(2_560),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string; publicId: string; width: string }> },
): Promise<Response> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return notFound();
  const { assetId, publicId, width } = parsed.data;
  let url: string | null;
  try {
    url = await new PublicWorkCoreClient(getVisitorCoreUrl()).getMediaUrl(publicId, assetId, width);
  } catch (error) {
    console.error('PUBLIC_WORK_MEDIA_URL_FAILED', {
      assetId,
      errorName: safeErrorName(error),
      publicId,
      width,
    });
    return unavailable();
  }
  if (url === null) return notFound();

  // Uploading replacement media always mints a new assetId, so an
  // (assetId, width) pair addresses immutable bytes. That makes the identity a
  // sound ETag and lets the response stay in browser cache indefinitely,
  // instead of re-hashing every megabyte on each request.
  const etag = `"${assetId}-${width}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      headers: { 'Cache-Control': IMMUTABLE_CACHE_CONTROL, ETag: etag },
      status: 304,
    });
  }

  const media = await fetchMedia(url, { assetId, publicId, width });
  if (media === null) return unavailable();
  return new Response(media.body, {
    headers: {
      'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      'Content-Type': 'image/webp',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      ...(media.contentLength === null ? {} : { 'Content-Length': media.contentLength }),
    },
  });
}

async function fetchMedia(
  url: string,
  context: { assetId: string; publicId: string; width: number },
): Promise<{ body: ReadableStream<Uint8Array>; contentLength: string | null } | null> {
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
        console.warn('PUBLIC_WORK_MEDIA_RETRY', {
          ...context,
          attempt,
          reason: 'fetch_failed',
        });
        await waitBeforeRetry();
        continue;
      }
      console.error('PUBLIC_WORK_MEDIA_FETCH_FAILED', {
        ...context,
        errorName: safeErrorName(error),
      });
      return null;
    }

    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      if (isRetryableStatus(upstream.status) && attempt < MAX_FETCH_ATTEMPTS) {
        console.warn('PUBLIC_WORK_MEDIA_RETRY', {
          ...context,
          attempt,
          reason: 'upstream_status',
          status: upstream.status,
        });
        await waitBeforeRetry();
        continue;
      }
      console.error('PUBLIC_WORK_MEDIA_UPSTREAM_FAILED', {
        ...context,
        status: upstream.status,
      });
      return null;
    }

    const declaredLength = Number(upstream.headers.get('content-length'));
    if (
      !upstream.headers.get('content-type')?.toLowerCase().startsWith('image/webp') ||
      (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES)
    ) {
      await upstream.body?.cancel().catch(() => undefined);
      console.error('PUBLIC_WORK_MEDIA_RESPONSE_INVALID', context);
      return null;
    }

    if (upstream.body === null) {
      console.error('PUBLIC_WORK_MEDIA_RESPONSE_INVALID', context);
      return null;
    }
    // The body streams straight through to the client, so a whole poster never
    // sits in this container's heap. Retrying is no longer possible once bytes
    // are in flight, so a mid-stream failure surfaces as a truncated response.
    return {
      body: boundedStream(upstream.body, MAX_MEDIA_BYTES, () => {
        console.error('PUBLIC_WORK_MEDIA_BODY_FAILED', context);
      }),
      contentLength:
        Number.isFinite(declaredLength) && declaredLength > 0 ? String(declaredLength) : null,
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
          controller.error(new Error('MEDIA_TOO_LARGE'));
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
    { error: { code: 'PUBLIC_WORK_NOT_FOUND' } },
    { headers: { 'Cache-Control': 'private, no-store' }, status: 404 },
  );
}

function unavailable(): Response {
  return Response.json(
    { error: { code: 'PUBLIC_WORK_MEDIA_UNAVAILABLE' } },
    { headers: { 'Cache-Control': 'private, no-store' }, status: 503 },
  );
}
