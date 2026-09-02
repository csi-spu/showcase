import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicWorkCoreClient } from '@/lib/public-work-core';

const MAX_MEDIA_BYTES = 5 * 1_024 * 1_024;
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

  const bytes = await fetchMediaBytes(url, { assetId, publicId, width });
  if (bytes === null) return unavailable();
  const etag = `"${createHash('sha256').update(new Uint8Array(bytes)).digest('base64url')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300', ETag: etag },
      status: 304,
    });
  }
  return new Response(bytes, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=300',
      'Content-Length': String(bytes.byteLength),
      'Content-Type': 'image/webp',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function fetchMediaBytes(
  url: string,
  context: { assetId: string; publicId: string; width: number },
): Promise<ArrayBuffer | null> {
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

    try {
      const bytes = await readBoundedBody(upstream, MAX_MEDIA_BYTES);
      if (bytes !== null) return bytes;
      console.error('PUBLIC_WORK_MEDIA_RESPONSE_INVALID', context);
      return null;
    } catch (error) {
      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.warn('PUBLIC_WORK_MEDIA_RETRY', {
          ...context,
          attempt,
          reason: 'body_failed',
        });
        await waitBeforeRetry();
        continue;
      }
      console.error('PUBLIC_WORK_MEDIA_BODY_FAILED', {
        ...context,
        errorName: safeErrorName(error),
      });
      return null;
    }
  }
  return null;
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

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<ArrayBuffer | null> {
  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
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
