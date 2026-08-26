import { createHash } from 'node:crypto';

const SITEMAP_KINDS = ['people', 'tags', 'works'] as const;

export function GET(request: Request): Response {
  const origin = new URL(request.url).origin;
  const locations = [`${origin}/sitemaps/base/00`];
  for (const kind of SITEMAP_KINDS) {
    for (let bucket = 0; bucket <= 255; bucket += 1) {
      locations.push(`${origin}/sitemaps/${kind}/${bucket.toString(16).padStart(2, '0')}`);
    }
  }
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((location) => `<sitemap><loc>${escapeXml(location)}</loc></sitemap>`).join('')}</sitemapindex>`,
    request,
  );
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function xmlResponse(body: string, request: Request): Response {
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
