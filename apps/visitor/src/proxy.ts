import { type NextRequest, NextResponse } from 'next/server';
import {
  isPublicHtmlSharedCacheEligible,
  matchesIfNoneMatch,
  publicCacheTags,
  publicHtmlEtag,
} from '@/lib/public-cache-tags';

const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=60';
const PRIVATE_CACHE_CONTROL = 'private, no-store';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const tags = publicCacheTags(request.nextUrl.pathname);
  if (tags.length > 0) {
    response.headers.set('Cache-Tag', tags.join(','));
    if (
      !request.nextUrl.pathname.includes('/media/') &&
      request.nextUrl.pathname !== '/sitemap.xml' &&
      !request.nextUrl.pathname.startsWith('/sitemaps/')
    ) {
      const isSharedCacheEligible = isPublicHtmlSharedCacheEligible(request.nextUrl);
      response.headers.set(
        'Cache-Control',
        isSharedCacheEligible ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL,
      );
      if (isSharedCacheEligible) {
        const version = await getPublicCacheVersion();
        if (version === null) {
          return NextResponse.json(
            { error: { code: 'PUBLIC_CACHE_VERSION_UNAVAILABLE' } },
            { headers: { 'Cache-Control': PRIVATE_CACHE_CONTROL }, status: 503 },
          );
        }
        const etag = publicHtmlEtag(request.nextUrl, version);
        if (matchesIfNoneMatch(request.headers.get('if-none-match'), etag)) {
          return new NextResponse(null, {
            headers: {
              'Cache-Control': PUBLIC_CACHE_CONTROL,
              'Cache-Tag': tags.join(','),
              ETag: etag,
            },
            status: 304,
          });
        }
        response.headers.set('ETag', etag);
      }
    }
  }
  return response;
}

async function getPublicCacheVersion(): Promise<string | null> {
  const coreUrl =
    process.env.CORE_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4100');
  if (coreUrl === undefined) return null;
  try {
    const cacheSecret =
      process.env.VISITOR_CACHE_SECRET ??
      (process.env.NODE_ENV === 'production'
        ? undefined
        : 'local-development-only-visitor-cache-secret');
    if (cacheSecret === undefined) return null;
    const response = await fetch(new URL('/v1/internal/visitor/cache-version', coreUrl), {
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        'x-visitor-cache-secret': cacheSecret,
      },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) return null;
    const version = Reflect.get(body, 'version') as unknown;
    return typeof version === 'string' && /^\d+$/u.test(version) ? version : null;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ['/((?!api/internal|_next/static|_next/image|favicon.ico|health).*)'],
};
