'use client';

import { cn } from '@showcase/ui/cn';
import { FolderKanbanIcon, LoaderCircleIcon, SearchIcon, UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { TypingAnimation } from '@/components/ui/typing-animation';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { isQuickSearchQueryReady } from './quick-search-state';

const SEARCH_DEBOUNCE_MILLISECONDS = 250;
const QUERY_MAXIMUM_LENGTH = 100;

const quickSearchResponseSchema = z
  .object({
    people: z
      .array(
        z
          .object({
            entryYear: z.number().int(),
            name: z.string().min(1).max(100),
            publicId: z.uuid(),
          })
          .strict(),
      )
      .max(5),
    works: z
      .array(
        z
          .object({
            attribution: z.string().max(2_140),
            publicId: z.uuid(),
            title: z.string().min(1).max(150),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

type QuickSearchResults = z.infer<typeof quickSearchResponseSchema>;
type SearchStatus = 'error' | 'idle' | 'loading' | 'success';

const EMPTY_RESULTS: QuickSearchResults = { people: [], works: [] };
const QuickSearchContext = createContext<(() => void) | null>(null);

export function QuickSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openSearch = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    const openFromKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', openFromKeyboard);
    return () => window.removeEventListener('keydown', openFromKeyboard);
  }, []);

  return (
    <QuickSearchContext.Provider value={openSearch}>
      {children}
      <QuickSearchDialog isOpen={isOpen} onOpenChange={setIsOpen} />
    </QuickSearchContext.Provider>
  );
}

export function QuickSearchTrigger({
  className,
  placement,
  placeholderWords,
}: {
  className?: string;
  placement: 'homepage' | 'navigation';
  placeholderWords?: readonly [string, ...string[]];
}) {
  const openSearch = useQuickSearch();
  const t = useTranslations('QuickSearch');
  const isNavigation = placement === 'navigation';

  return (
    <Button
      aria-label={isNavigation ? t('navTrigger') : t('trigger')}
      className={cn(
        'justify-start',
        isNavigation
          ? 'min-h-10 w-10 rounded-full border-primary/35 bg-primary/[0.04] px-0 font-normal shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary),transparent_90%)] hover:border-primary/60 hover:bg-primary/[0.08] focus-visible:ring-primary/25 md:w-48 md:px-3 lg:w-56'
          : 'min-h-16 w-full rounded-full border-2 border-primary/70 bg-background/95 px-5 shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary),transparent_82%),0_1.25rem_3rem_-1rem_color-mix(in_oklch,var(--primary),transparent_28%)] backdrop-blur-xl hover:border-primary hover:bg-background focus-visible:ring-4 focus-visible:ring-primary/25 sm:px-6',
        className,
      )}
      data-quick-search-trigger={placement}
      onClick={openSearch}
      size="lg"
      type="button"
      variant="outline"
    >
      <SearchIcon data-icon="inline-start" />
      <span className={cn('min-w-0 flex-1 truncate text-left', isNavigation && 'hidden md:block')}>
        {!isNavigation && placeholderWords !== undefined ? (
          <TypingAnimation
            aria-hidden="true"
            className="max-w-full truncate align-middle text-muted-foreground"
            deleteSpeed={30}
            loop
            pauseDelay={1_500}
            showCursor
            startOnView={false}
            typeSpeed={65}
            words={placeholderWords}
          />
        ) : (
          t(isNavigation ? 'navTrigger' : 'trigger')
        )}
      </span>
      <kbd
        aria-hidden="true"
        className={cn(
          'ml-auto hidden border px-1.5 py-0.5 font-mono text-xs text-muted-foreground lg:inline-flex',
          isNavigation
            ? 'rounded-full border-primary/20 bg-background/70'
            : 'rounded-full border-primary/30 bg-primary/[0.06]',
          !isNavigation && 'sm:inline-flex',
        )}
      >
        ⌘K
      </kbd>
    </Button>
  );
}

function QuickSearchDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations('QuickSearch');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickSearchResults>(EMPTY_RESULTS);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const normalizedQuery = query.trim();
  const isQueryReady = isQuickSearchQueryReady(query);

  useEffect(() => {
    if (!isOpen || !isQueryReady) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/quick-search?q=${encodeURIComponent(normalizedQuery)}`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('QUICK_SEARCH_REQUEST_FAILED');
        const nextResults = quickSearchResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setResults(nextResults);
        setStatus('success');
      } catch {
        if (controller.signal.aborted) return;
        setResults(EMPTY_RESULTS);
        setStatus('error');
      }
    }, SEARCH_DEBOUNCE_MILLISECONDS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, isQueryReady, normalizedQuery]);

  const hasResults = results.people.length > 0 || results.works.length > 0;
  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setResults(EMPTY_RESULTS);
    setStatus(isQuickSearchQueryReady(nextQuery) ? 'loading' : 'idle');
  };
  const closeAndNavigate = (href: string) => {
    onOpenChange(false);
    setQuery('');
    setResults(EMPTY_RESULTS);
    setStatus('idle');
    router.push(href);
  };
  const handleOpenChange = (nextIsOpen: boolean) => {
    onOpenChange(nextIsOpen);
    if (!nextIsOpen) {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setStatus('idle');
    }
  };

  return (
    <CommandDialog
      className="top-[35%] translate-y-0 overflow-visible border-0 bg-transparent p-0 ring-0 shadow-none sm:max-w-2xl"
      description={t('dialogDescription')}
      onOpenChange={handleOpenChange}
      open={isOpen}
      title={t('dialogTitle')}
    >
      <Command
        className="h-auto w-full overflow-visible rounded-none! bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:rounded-full [&_[data-slot=command-input-wrapper]]:border [&_[data-slot=command-input-wrapper]]:border-primary/45 [&_[data-slot=command-input-wrapper]]:bg-popover [&_[data-slot=command-input-wrapper]]:p-2 [&_[data-slot=command-input-wrapper]]:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary),transparent_88%),0_1.5rem_4rem_-1.5rem_color-mix(in_oklch,var(--primary),transparent_35%)] [&_[data-slot=input-group]]:h-14! [&_[data-slot=input-group]]:rounded-full! [&_[data-slot=input-group]]:border-primary/25 [&_[data-slot=input-group]]:bg-primary/[0.03]"
        loop
        shouldFilter={false}
      >
        <CommandInput
          aria-label={t('placeholder')}
          autoComplete="off"
          className="h-12 text-base"
          maxLength={QUERY_MAXIMUM_LENGTH}
          onValueChange={handleQueryChange}
          placeholder={t('placeholder')}
          value={query}
        />
        {isQueryReady ? (
          <CommandList
            aria-busy={status === 'loading'}
            className="mt-3 max-h-[min(26rem,60vh)] rounded-3xl border border-primary/30 bg-popover p-1 shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary),transparent_92%),0_1.5rem_4rem_-1.5rem_color-mix(in_oklch,var(--primary),transparent_42%)]"
          >
            {status === 'loading' ? (
              <SearchMessage>
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
                {t('loading')}
              </SearchMessage>
            ) : null}
            {status === 'error' ? <SearchMessage role="alert">{t('error')}</SearchMessage> : null}
            {status === 'success' && !hasResults ? (
              <CommandEmpty>{t('noResults')}</CommandEmpty>
            ) : null}
            {results.people.length > 0 ? (
              <CommandGroup heading={t('peopleGroup')}>
                {results.people.map((person) => (
                  <CommandItem
                    className="min-h-14 px-3"
                    key={person.publicId}
                    onSelect={() => closeAndNavigate(`/people/${person.publicId}`)}
                    value={`person-${person.publicId}`}
                  >
                    <UserRoundIcon aria-hidden="true" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-medium">{person.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t('studentEntryYear', { year: person.entryYear })}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {results.people.length > 0 && results.works.length > 0 ? <CommandSeparator /> : null}
            {results.works.length > 0 ? (
              <CommandGroup heading={t('worksGroup')}>
                {results.works.map((work) => (
                  <CommandItem
                    className="min-h-14 px-3"
                    key={work.publicId}
                    onSelect={() => closeAndNavigate(`/works/${work.publicId}`)}
                    value={`work-${work.publicId}`}
                  >
                    <FolderKanbanIcon aria-hidden="true" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-medium">{work.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {work.attribution}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        ) : null}
      </Command>
    </CommandDialog>
  );
}

function SearchMessage({
  children,
  role = 'status',
}: {
  children: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      className="flex min-h-28 items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground"
      role={role}
    >
      {children}
    </div>
  );
}

function useQuickSearch() {
  const openSearch = useContext(QuickSearchContext);
  if (openSearch === null) throw new Error('QUICK_SEARCH_PROVIDER_MISSING');
  return openSearch;
}
