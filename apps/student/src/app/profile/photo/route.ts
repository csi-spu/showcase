import { createHash } from 'node:crypto';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { StudentProfileCoreClient, StudentProfileCoreError } from '@/lib/student-profile-core';

const MAX_SANITIZED_PHOTO_BYTES = 8 * 1_024 * 1_024;
const PRIVATE_CACHE_CONTROL = 'private, max-age=0, must-revalidate';

export async function GET(request: Request): Promise<Response> {
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) return unauthenticated();

  let photoUrl: string;
  try {
    photoUrl = await new StudentProfileCoreClient(getStudentServerEnvironment()).getPhotoUrl(
      sessionToken,
    );
  } catch (error: unknown) {
    if (
      error instanceof StudentProfileCoreError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      return unauthenticated();
    }
    if (error instanceof StudentProfileCoreError && error.code === 'PROFILE_PHOTO_NOT_FOUND') {
      return notFound();
    }
    throw error;
  }

  const upstream = await fetch(photoUrl, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { accept: 'image/webp' },
    signal: AbortSignal.timeout(5_000),
  });
  const declaredLength = Number(upstream.headers.get('content-length'));
  if (
    !upstream.ok ||
    !upstream.headers.get('content-type')?.toLowerCase().startsWith('image/webp') ||
    (Number.isFinite(declaredLength) && declaredLength > MAX_SANITIZED_PHOTO_BYTES)
  ) {
    return notFound();
  }

  const bytes = await readBoundedBody(upstream, MAX_SANITIZED_PHOTO_BYTES);
  if (bytes === null) return notFound();
  const etag = `"${createHash('sha256').update(new Uint8Array(bytes)).digest('base64url')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      headers: { 'Cache-Control': PRIVATE_CACHE_CONTROL, ETag: etag },
      status: 304,
    });
  }

  return new Response(bytes, {
    headers: {
      'Cache-Control': PRIVATE_CACHE_CONTROL,
      'Content-Length': String(bytes.byteLength),
      'Content-Type': 'image/webp',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
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
  return Response.json({ error: { code: 'PROFILE_PHOTO_NOT_FOUND' } }, { status: 404 });
}

function unauthenticated(): Response {
  return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
}
