import type { CatalogSearchParams } from '@/lib/public-catalog-core';

const PAGINATION_KEYS = new Set(['cursor', 'page', 'trail']);
const MAX_CURSOR_TRAIL = 20;

export interface CatalogPagination {
  currentPage: number;
  nextUrl: string | null;
  previousUrl: string | null;
}

export function catalogCurrentUrl(path: string, params: CatalogSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) query.append(key, value);
  }
  const suffix = query.toString();
  return suffix === '' ? path : `${path}?${suffix}`;
}

export function catalogPagination(
  path: string,
  params: CatalogSearchParams,
  nextCursor: string | null,
): CatalogPagination {
  const currentCursor = single(params.cursor);
  const currentPage = currentCursor === '' ? 1 : pageNumber(params.page);
  const trail = values(params.trail).filter(Boolean).slice(-MAX_CURSOR_TRAIL);
  const filters = catalogFilters(params);

  return {
    currentPage,
    nextUrl:
      nextCursor === null
        ? null
        : paginationUrl(path, filters, {
            cursor: nextCursor,
            page: currentPage + 1,
            trail: currentCursor === '' ? trail : [...trail, currentCursor],
          }),
    previousUrl:
      currentPage === 1
        ? null
        : paginationUrl(path, filters, {
            cursor: trail.at(-1),
            page: currentPage - 1,
            trail: trail.slice(0, -1),
          }),
  };
}

const PAGE_WINDOW_RADIUS = 2;

export interface CatalogPageWindow {
  currentPage: number;
  firstPage: { href: string; page: number } | null;
  nextUrl: string | null;
  pages: Array<{ href: string; page: number }>;
  previousUrl: string | null;
}

export function catalogPageWindow(
  path: string,
  params: CatalogSearchParams,
  nextCursor: string | null,
): CatalogPageWindow {
  const { currentPage, nextUrl, previousUrl } = catalogPagination(path, params, nextCursor);
  const trail = values(params.trail).filter(Boolean).slice(-MAX_CURSOR_TRAIL);
  const filters = catalogFilters(params);
  const rawWindowStart = Math.max(1, currentPage - PAGE_WINDOW_RADIUS);
  // A window that starts on page 2 would pin page 1 behind a pointless single-page ellipsis.
  const windowStart = rawWindowStart === 2 ? 1 : rawWindowStart;

  const pages: Array<{ href: string; page: number }> = [];
  for (let page = windowStart; page <= currentPage; page += 1) {
    pages.push({ href: hrefForPage(page), page });
  }

  return {
    currentPage,
    firstPage: windowStart > 1 ? { href: hrefForPage(1), page: 1 } : null,
    nextUrl,
    pages,
    previousUrl,
  };

  function hrefForPage(page: number): string {
    if (page === currentPage) return catalogCurrentUrl(path, params);
    if (page === 1) return paginationUrl(path, filters, { cursor: undefined, page: 1, trail: [] });
    return paginationUrl(path, filters, {
      cursor: trail[page - 2],
      page,
      trail: trail.slice(0, page - 2),
    });
  }
}

export function catalogContinuationUrl(
  path: string,
  params: CatalogSearchParams,
  cursor: string,
): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === 'cursor' || raw === undefined) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) query.append(key, value);
  }
  query.set('cursor', cursor);
  return `${path}?${query.toString()}`;
}

export function hasCatalogVariant(
  params: CatalogSearchParams,
  defaults: Record<string, string>,
): boolean {
  return Object.entries(params).some(([key, raw]) => {
    if (raw === undefined) return false;
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length === 0 || values.every((value) => value.length === 0)) return false;
    return values.length > 1 || defaults[key] === undefined || values[0] !== defaults[key];
  });
}

function catalogFilters(params: CatalogSearchParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (PAGINATION_KEYS.has(key) || raw === undefined) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) query.append(key, value);
  }
  return query;
}

function paginationUrl(
  path: string,
  filters: URLSearchParams,
  state: { cursor: string | undefined; page: number; trail: string[] },
): string {
  const query = new URLSearchParams(filters);
  for (const cursor of state.trail.slice(-MAX_CURSOR_TRAIL)) query.append('trail', cursor);
  if (state.cursor !== undefined) query.set('cursor', state.cursor);
  if (state.page > 1) query.set('page', String(state.page));
  const suffix = query.toString();
  return suffix === '' ? path : `${path}?${suffix}`;
}

function pageNumber(raw: string | string[] | undefined): number {
  const value = Number(single(raw));
  return Number.isSafeInteger(value) && value >= 2 ? value : 2;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function values(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
