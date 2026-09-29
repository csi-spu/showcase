'use client';

import { Button } from '@showcase/ui/button';
import { RotateCcwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { readFieldAnswersAction } from '@/app/collection-forms.actions';
import type {
  FieldAnswersReadResult,
  InstructorFieldAnswersPage,
} from '@/lib/instructor-collection-forms-contract';

type LoadStatus = 'failed' | 'idle' | 'loading';

export interface AnswerPages<Item> {
  hasMore: boolean;
  items: Item[];
  loadMore: () => Promise<void>;
  status: LoadStatus;
}

/**
 * One question's answers, loaded a page at a time.
 *
 * A failed page keeps everything already shown and offers the same page
 * again: the cursor only advances once a page has arrived.
 */
export function useAnswerPages<Item>({
  fieldId,
  formId,
  initial,
  mode,
  select,
}: {
  fieldId: string;
  formId: string;
  initial: { items: Item[]; nextCursor: string | null };
  mode: 'question' | 'summary';
  /** The page's items when it is the kind this list shows, otherwise null. */
  select: (page: InstructorFieldAnswersPage) => Item[] | null;
}): AnswerPages<Item> {
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const isLoading = useRef(false);

  async function loadMore(): Promise<void> {
    if (nextCursor === null || isLoading.current) return;
    isLoading.current = true;
    setStatus('loading');
    let result: FieldAnswersReadResult;
    try {
      result = await readFieldAnswersAction(formId, fieldId, mode, nextCursor);
    } catch {
      /* A dropped connection is retried like any other failed page. */
      result = { ok: false };
    } finally {
      isLoading.current = false;
    }
    const page = result.ok ? select(result.page) : null;
    if (!result.ok || page === null) {
      setStatus('failed');
      return;
    }
    setItems((current) => [...current, ...page]);
    setNextCursor(result.page.nextCursor);
    setStatus('idle');
  }

  return { hasMore: nextCursor !== null, items, loadMore, status };
}

export function ShowMore<Item>({ pages }: { pages: AnswerPages<Item> }) {
  const t = useTranslations('Forms.responses');

  if (!pages.hasMore) return null;

  if (pages.status === 'failed') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
        {t('loadMoreFailed')}
        <Button
          className="active:scale-95"
          onClick={() => void pages.loadMore()}
          size="sm"
          variant="outline"
        >
          <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          {t('retry')}
        </Button>
      </div>
    );
  }

  const isLoading = pages.status === 'loading';
  return (
    <Button
      className="self-start active:scale-95"
      disabled={isLoading}
      onClick={() => void pages.loadMore()}
      size="sm"
      variant="outline"
    >
      {isLoading ? <Spinner aria-hidden="true" /> : null}
      {isLoading ? t('loadingMore') : t('showMore')}
    </Button>
  );
}
