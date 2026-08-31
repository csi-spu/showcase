import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicWorkCoreClient } from '@/lib/public-work-core';

const MAX_MEDIA_BYTES = 5 * 1_024 * 1_024;
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
    console.error('PUBLIC_WORK_MEDIA_URL_FAILED', { assetId, publicId, width }, error);
    return unavailable();
  }
  if (url === null) return notFound();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'image/webp' },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    console.error('PUBLIC_WORK_MEDIA_FETCH_FAILED', { assetId, publicId, width }, error);
    return notFound();
  }
  const declaredLength = Number(upstream.headers.get('content-length'));
  if (!upstream.ok) {
    if (upstream.status >= 500) {
      console.error('PUBLIC_WORK_MEDIA_UPSTREAM_FAILED', {
        assetId,
        publicId,
        status: upstream.status,
        width,
      });
      return unavailable();
    }
    return notFound();
  }
  if (
    !upstream.headers.get('content-type')?.toLowerCase().startsWith('image/webp') ||
    (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES)
  ) {
    return notFound();
  }
  let bytes: ArrayBuffer | null;
  try {
    bytes = await readBoundedBody(upstream, MAX_MEDIA_BYTES);
  } catch (error) {
    console.error('PUBLIC_WORK_MEDIA_BODY_FAILED', { assetId, publicId, width }, error);
    return unavailable();
  }
  if (bytes === null) return notFound();
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
  return Response.json({ error: { code: 'PUBLIC_WORK_NOT_FOUND' } }, { status: 404 });
}

function unavailable(): Response {
  return Response.json(
    { error: { code: 'PUBLIC_WORK_MEDIA_UNAVAILABLE' } },
    { headers: { 'Cache-Control': 'private, no-store' }, status: 503 },
  );
}
