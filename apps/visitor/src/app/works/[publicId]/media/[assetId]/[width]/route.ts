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
  const url = await new PublicWorkCoreClient(getVisitorCoreUrl()).getMediaUrl(
    publicId,
    assetId,
    width,
  );
  if (url === null) return notFound();

  const upstream = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { accept: 'image/webp' },
    signal: AbortSignal.timeout(5_000),
  });
  const declaredLength = Number(upstream.headers.get('content-length'));
  if (
    !upstream.ok ||
    !upstream.headers.get('content-type')?.toLowerCase().startsWith('image/webp') ||
    (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES)
  ) {
    return notFound();
  }
  const bytes = await readBoundedBody(upstream, MAX_MEDIA_BYTES);
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
