import type { CatalogSearchParams } from '@/lib/public-catalog-core';

const PAGINATION_KEYS = new Set(['page']);
const PAGE_WINDOW_RADIUS = 2;

export interface CatalogPageWindow {
  currentPage: number;
  firstPage: { href: string; page: number } | null;
  lastPage: { href: string; page: number } | null;
  nextUrl: string | null;
  pages: Array<{ href: string; page: number }>;
  previousUrl: string | null;
  totalPages: number;
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

export function catalogPageHref(path: string, params: CatalogSearchParams, page: number): string {
  const filters = catalogFilters(params);
  const query = new URLSearchParams(filters);
  if (page > 1) query.set('page', String(page));
  const suffix = query.toString();
  return suffix === '' ? path : `${path}?${suffix}`;
}

export function catalogPageWindow(
  path: string,
  params: CatalogSearchParams,
  totalPages: number,
): CatalogPageWindow {
  const currentPage = clampPage(pageNumber(params.page), totalPages);
  const rawWindowStart = Math.max(1, currentPage - PAGE_WINDOW_RADIUS);
  // A window that starts on page 2 would pin page 1 behind a pointless single-page ellipsis.
  const windowStart = rawWindowStart === 2 ? 1 : rawWindowStart;
  const rawWindowEnd = Math.min(totalPages, currentPage + PAGE_WINDOW_RADIUS);
  // Symmetrically, a window ending one short of the last page would pin it behind a pointless ellipsis.
  const windowEnd = rawWindowEnd === totalPages - 1 ? totalPages : rawWindowEnd;

  const pages: Array<{ href: string; page: number }> = [];
  for (let page = windowStart; page <= windowEnd; page += 1) {
    pages.push({ href: catalogPageHref(path, params, page), page });
  }

  return {
    currentPage,
    firstPage: windowStart > 1 ? { href: catalogPageHref(path, params, 1), page: 1 } : null,
    lastPage:
      windowEnd < totalPages
        ? { href: catalogPageHref(path, params, totalPages), page: totalPages }
        : null,
    nextUrl: currentPage < totalPages ? catalogPageHref(path, params, currentPage + 1) : null,
    pages,
    previousUrl: currentPage > 1 ? catalogPageHref(path, params, currentPage - 1) : null,
    totalPages,
  };
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

function pageNumber(raw: string | string[] | undefined): number {
  const value = Number(single(raw));
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
