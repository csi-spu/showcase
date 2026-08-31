import { MoreHorizontalIcon } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import type { CatalogPageWindow } from './catalog-url';

export interface CatalogPaginationLabels {
  ellipsis: string;
  goToPage(page: number): string;
  nextPage: string;
  previousPage: string;
}

export function CatalogPagination({
  ariaLabel,
  labels,
  window,
}: {
  ariaLabel: string;
  labels: CatalogPaginationLabels;
  window: CatalogPageWindow;
}) {
  if (window.previousUrl === null && window.nextUrl === null && window.pages.length <= 1) {
    return null;
  }

  return (
    <Pagination aria-label={ariaLabel}>
      <PaginationContent className="flex-wrap justify-center">
        {window.previousUrl ? (
          <PaginationItem>
            <PaginationPrevious href={window.previousUrl} rel="prev" text={labels.previousPage} />
          </PaginationItem>
        ) : null}
        {window.firstPage ? (
          <>
            <PaginationItem>
              <PaginationLink
                aria-label={labels.goToPage(window.firstPage.page)}
                href={window.firstPage.href}
              >
                {window.firstPage.page}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center text-muted-foreground"
              >
                <MoreHorizontalIcon className="size-4" />
              </span>
              <span className="sr-only">{labels.ellipsis}</span>
            </PaginationItem>
          </>
        ) : null}
        {window.pages.map(({ href, page }) => (
          <PaginationItem key={page}>
            <PaginationLink
              aria-label={labels.goToPage(page)}
              href={href}
              isActive={page === window.currentPage}
            >
              {page}
            </PaginationLink>
          </PaginationItem>
        ))}
        {window.nextUrl ? (
          <PaginationItem>
            <PaginationNext href={window.nextUrl} rel="next" text={labels.nextPage} />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
