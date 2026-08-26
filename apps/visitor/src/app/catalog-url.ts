import type { CatalogSearchParams } from '@/lib/public-catalog-core';

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
