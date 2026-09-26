/**
 * The page numbers to offer: always the first and last, the current page and
 * its neighbours, and a gap marker wherever pages are skipped.
 */
export function pageItems(page: number, pageCount: number): Array<number | 'gap'> {
  const shown = new Set([1, pageCount, page - 1, page, page + 1]);
  const items: Array<number | 'gap'> = [];
  for (let candidate = 1; candidate <= pageCount; candidate += 1) {
    if (shown.has(candidate)) {
      items.push(candidate);
    } else if (items.at(-1) !== 'gap') {
      items.push('gap');
    }
  }
  return items;
}

/* The page to show when `page` may have run past the pages that exist. */
export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, Math.trunc(page)), pageCount);
}
