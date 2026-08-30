export type PaginationItem = number | `ellipsis-${number}`;

export function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const visible = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  for (const page of visible) {
    const previous = items.at(-1);
    if (typeof previous === 'number' && page - previous > 1) items.push(`ellipsis-${previous}`);
    items.push(page);
  }
  return items;
}
