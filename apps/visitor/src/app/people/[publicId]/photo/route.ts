import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getVisitorCoreUrl, PublicProfileCoreClient } from '@/lib/public-profile-core';

const MAX_SANITIZED_PHOTO_BYTES = 8 * 1_024 * 1_024;
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

  const bytes = await fetchPhotoBytes(photoUrl, publicId);
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

async function fetchPhotoBytes(url: string, publicId: string): Promise<ArrayBuffer | null> {
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

    try {
      const bytes = await readBoundedBody(upstream, MAX_SANITIZED_PHOTO_BYTES);
      if (bytes !== null) return bytes;
      console.error('PUBLIC_PROFILE_PHOTO_RESPONSE_INVALID', { publicId });
      return null;
    } catch (error) {
      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.warn('PUBLIC_PROFILE_PHOTO_RETRY', {
          attempt,
          publicId,
          reason: 'body_failed',
        });
        await waitBeforeRetry();
        continue;
      }
      console.error('PUBLIC_PROFILE_PHOTO_BODY_FAILED', {
        errorName: safeErrorName(error),
        publicId,
      });
      return null;
    }
  }
  return null;
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
