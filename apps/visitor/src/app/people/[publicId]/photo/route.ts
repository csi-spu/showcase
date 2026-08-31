import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getVisitorCoreUrl, PublicProfileCoreClient } from '@/lib/public-profile-core';

const MAX_SANITIZED_PHOTO_BYTES = 8 * 1_024 * 1_024;

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
    console.error('PUBLIC_PROFILE_PHOTO_URL_FAILED', { publicId }, error);
    return unavailable();
  }
  if (photoUrl === null) return notFound();

  let upstream: Response;
  try {
    upstream = await fetch(photoUrl, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'image/webp' },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    console.error('PUBLIC_PROFILE_PHOTO_FETCH_FAILED', { publicId }, error);
    return notFound();
  }
  const declaredLength = Number(upstream.headers.get('content-length'));
  if (!upstream.ok) {
    if (upstream.status >= 500) {
      console.error('PUBLIC_PROFILE_PHOTO_UPSTREAM_FAILED', { publicId, status: upstream.status });
      return unavailable();
    }
    return notFound();
  }
  if (
    !upstream.headers.get('content-type')?.toLowerCase().startsWith('image/webp') ||
    (Number.isFinite(declaredLength) && declaredLength > MAX_SANITIZED_PHOTO_BYTES)
  ) {
    return notFound();
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await upstream.arrayBuffer();
  } catch (error) {
    console.error('PUBLIC_PROFILE_PHOTO_BODY_FAILED', { publicId }, error);
    return unavailable();
  }
  if (bytes.byteLength > MAX_SANITIZED_PHOTO_BYTES) return notFound();
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

function notFound(): Response {
  return Response.json({ error: { code: 'PUBLIC_PROFILE_NOT_FOUND' } }, { status: 404 });
}

function unavailable(): Response {
  return Response.json(
    { error: { code: 'PUBLIC_PROFILE_PHOTO_UNAVAILABLE' } },
    { headers: { 'Cache-Control': 'private, no-store' }, status: 503 },
  );
}
