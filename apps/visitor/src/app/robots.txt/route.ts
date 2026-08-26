export function GET(request: Request): Response {
  const origin = new URL(request.url).origin;
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
