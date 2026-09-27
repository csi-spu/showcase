'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { pageItems } from '@/lib/pagination';

/**
 * Previous, numbered pages with gaps, and next, for a list paged in the
 * browser. The labels come from the caller so each list names its own pages.
 */
export function PageNav({
  labels,
  onPageChange,
  page,
  pageCount,
}: {
  labels: { nav: string; next: string; page: (page: number) => string; previous: string };
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
}) {
  return (
    <nav aria-label={labels.nav}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <Button
            aria-label={labels.previous}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
        </li>
        {pageItems(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <li aria-hidden="true" className="px-1 text-muted-foreground" key={`gap-${index}`}>
              …
            </li>
          ) : (
            <li key={item}>
              <Button
                aria-current={item === page ? 'page' : undefined}
                aria-label={labels.page(item)}
                className={cn(
                  'min-w-9 tabular-nums transition-[background-color,color,scale] duration-200 active:scale-90 motion-reduce:transition-none',
                  item === page && 'shadow-sm shadow-primary/20',
                )}
                onClick={() => onPageChange(item)}
                size="icon-sm"
                variant={item === page ? 'default' : 'ghost'}
              >
                {item}
              </Button>
            </li>
          ),
        )}
        <li>
          <Button
            aria-label={labels.next}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </li>
      </ul>
    </nav>
  );
}
