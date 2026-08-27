import { PublicCatalogCoreClient } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';

const QUICK_SEARCH_LIMIT = '5';
const QUERY_MINIMUM_LENGTH = 2;
const QUERY_MAXIMUM_LENGTH = 100;
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

type QuickSearchCatalog = Pick<PublicCatalogCoreClient, 'listPeople' | 'listWorks'>;

export function createQuickSearchHandler(catalog: QuickSearchCatalog) {
  return async function GET(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    const queryLength = Array.from(query).length;
    if (queryLength < QUERY_MINIMUM_LENGTH || queryLength > QUERY_MAXIMUM_LENGTH) {
      return Response.json(
        { error: { code: 'QUICK_SEARCH_QUERY_INVALID' } },
        { headers: NO_STORE_HEADERS, status: 400 },
      );
    }

    try {
      const [peoplePage, worksPage] = await Promise.all([
        catalog.listPeople({ limit: QUICK_SEARCH_LIMIT, q: query }),
        catalog.listWorks({ limit: QUICK_SEARCH_LIMIT, q: query }),
      ]);
      return Response.json(
        {
          people: peoplePage.items.map(({ displayName, entryYear, publicId }) => ({
            entryYear,
            name: displayName,
            publicId,
          })),
          works: worksPage.items.map(({ attributions, title, workPublicId }) => ({
            attribution: attributions.join(', '),
            publicId: workPublicId,
            title,
          })),
        },
        { headers: NO_STORE_HEADERS },
      );
    } catch {
      return Response.json(
        { error: { code: 'QUICK_SEARCH_UNAVAILABLE' } },
        { headers: NO_STORE_HEADERS, status: 503 },
      );
    }
  };
}

export const GET = createQuickSearchHandler(new PublicCatalogCoreClient(getVisitorCoreUrl()));
