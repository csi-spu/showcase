'use client';

import { cn } from '@showcase/ui/cn';
import { CalendarRangeIcon, ChevronDownIcon, LayersIcon, UsersIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/*
 * Resolved here, inside the client boundary: a Server Component cannot pass a
 * component across it, so the shell sends this key and the lookup below turns
 * it back into the icon.
 */
const FILTER_ICONS = {
  calendarRange: CalendarRangeIcon,
  layers: LayersIcon,
  users: UsersIcon,
} as const;

export interface ScopeOption {
  label: string;
  value: string;
}

export interface ScopeFilter {
  icon: keyof typeof FILTER_ICONS;
  /** The query-string key this dropdown owns. */
  name: string;
  options: ScopeOption[];
  /** Shown as the first option, meaning "no filter". */
  placeholder: string;
  value: string | undefined;
}

/*
 * The scope is held in the URL rather than component state: the page is a
 * Server Component that reads Core with the scope applied, so a filter change
 * is a navigation. It also makes a filtered view linkable and survives a
 * reload, which local state would not.
 */
export function ScopeFilters({ filters, label }: { filters: ScopeFilter[]; label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setFilter = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === '') next.delete(name);
      else next.set(name, value);
      /*
       * Any scope change invalidates the cursor that was read under the old
       * scope, so paging restarts rather than resuming at a row the new
       * filter may exclude.
       */
      next.delete('cursor');
      const query = next.toString();
      startTransition(() => router.push(query === '' ? pathname : `${pathname}?${query}`));
    },
    [pathname, router, searchParams],
  );

  return (
    <div
      aria-busy={isPending}
      aria-label={label}
      className={cn(
        'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
        /* The pending view is still the old scope, so it is dimmed rather
           than replaced -- swapping in a spinner would lose the reader's
           place for what is usually a few hundred milliseconds. */
        isPending && 'opacity-60 transition-opacity motion-reduce:transition-none',
      )}
      role="group"
    >
      {filters.map((filter) => {
        const Icon = FILTER_ICONS[filter.icon];
        return (
          <div className="relative flex items-center" key={filter.name}>
            <Icon
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 size-4.5 text-muted-foreground"
            />
            <select
              aria-label={filter.placeholder}
              className="w-full appearance-none rounded-surface border border-border/80 bg-card py-2.5 pr-10 pl-11 text-sm font-medium text-foreground transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
              disabled={isPending}
              name={filter.name}
              onChange={(event) => setFilter(filter.name, event.target.value)}
              value={filter.value ?? ''}
            >
              <option value="">{filter.placeholder}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground"
            />
          </div>
        );
      })}
    </div>
  );
}
