import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PublicCatalogCoreClient } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';

const kindSchema = z.enum(['base', 'people', 'tags', 'works']);
const bucketSchema = z.string().regex(/^[0-9a-f]{2}$/u);

export async function GET(
  request: Request,
  context: { params: Promise<{ bucket: string; kind: string }> },
): Promise<Response> {
  const parsed = z
    .object({ bucket: bucketSchema, kind: kindSchema })
    .safeParse(await context.params);
  if (!parsed.success || (parsed.data.kind === 'base' && parsed.data.bucket !== '00')) {
    return Response.json({ error: { code: 'PUBLIC_SITEMAP_NOT_FOUND' } }, { status: 404 });
  }
  const origin = new URL(request.url).origin;
  if (parsed.data.kind === 'base') {
    return sitemapResponse(
      [
        { location: `${origin}/`, lastModified: null },
        { location: `${origin}/works`, lastModified: null },
        { location: `${origin}/people`, lastModified: null },
      ],
      request,
    );
  }
  const entries = await new PublicCatalogCoreClient(getVisitorCoreUrl()).listSitemapEntries(
    parsed.data.kind,
    parsed.data.bucket,
  );
  const segment = parsed.data.kind === 'works' ? 'works' : parsed.data.kind;
  return sitemapResponse(
    entries.map((entry) => ({
      lastModified: entry.lastModified,
      location: `${origin}/${segment}/${entry.publicId}`,
    })),
    request,
  );
}

function sitemapResponse(
  entries: Array<{ lastModified: string | null; location: string }>,
  request: Request,
): Response {
  const urls = entries
    .map(
      (entry) =>
        `<url><loc>${escapeXml(entry.location)}</loc>${entry.lastModified === null ? '' : `<lastmod>${escapeXml(entry.lastModified)}</lastmod>`}</url>`,
    )
    .join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  const etag = `"${createHash('sha256').update(body).digest('base64url')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
        ETag: etag,
      },
      status: 304,
    });
  }
  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
      'Content-Type': 'application/xml; charset=utf-8',
      ETag: etag,
    },
  });
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
