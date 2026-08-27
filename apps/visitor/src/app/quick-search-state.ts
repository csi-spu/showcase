const QUICK_SEARCH_QUERY_MINIMUM_LENGTH = 2;

export function isQuickSearchQueryReady(query: string): boolean {
  return Array.from(query.trim()).length >= QUICK_SEARCH_QUERY_MINIMUM_LENGTH;
}
