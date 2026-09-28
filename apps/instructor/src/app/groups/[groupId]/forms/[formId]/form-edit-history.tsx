'use client';

import { Button } from '@showcase/ui/button';
import { HistoryIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import type {
  FormHistoryReadResult,
  InstructorFormHistoryChange,
  InstructorFormHistoryEntry,
} from '@/lib/instructor-collection-forms-contract';

/** Stored in UTC, read in the timezone Instructors work in. */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

function formatDateTime(value: string): string {
  return DATE_TIME_FORMAT.format(new Date(value));
}

type HistoryState =
  | { status: 'loading' }
  | { status: 'failed' }
  | {
      entries: InstructorFormHistoryEntry[];
      more: 'failed' | 'idle' | 'loading';
      nextCursor: string | null;
      status: 'loaded';
    };

/*
 * The form's edit history in a side panel.
 *
 * It is read only when the panel opens, and afresh each time, so the form page
 * never waits on it and a Core that cannot serve it costs the panel alone.
 */
export function FormEditHistory({
  readHistory,
}: {
  readHistory: (cursor: string | null) => Promise<FormHistoryReadResult>;
}) {
  const t = useTranslations('Forms.editHistory');
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  /* Only the latest read may land; a slower earlier one is dropped. */
  const latestRead = useRef(0);

  async function loadFirstPage() {
    const read = ++latestRead.current;
    setState({ status: 'loading' });
    const result = await readHistory(null);
    if (read !== latestRead.current) return;
    setState(
      result.ok
        ? {
            entries: result.page.entries,
            more: 'idle',
            nextCursor: result.page.nextCursor,
            status: 'loaded',
          }
        : { status: 'failed' },
    );
  }

  async function loadMore(loaded: Extract<HistoryState, { status: 'loaded' }>) {
    const read = ++latestRead.current;
    setState({ ...loaded, more: 'loading' });
    const result = await readHistory(loaded.nextCursor);
    if (read !== latestRead.current) return;
    setState(
      result.ok
        ? {
            entries: [...loaded.entries, ...result.page.entries],
            more: 'idle',
            nextCursor: result.page.nextCursor,
            status: 'loaded',
          }
        : { ...loaded, more: 'failed' },
    );
  }

  function describeChange(change: InstructorFormHistoryChange): string {
    switch (change.kind) {
      case 'title_changed':
        return t('change.titleChanged', { next: change.next, previous: change.previous });
      case 'description_changed':
        return t('change.descriptionChanged');
      case 'deadline_changed':
        return t('change.deadlineChanged', {
          next: change.next === null ? t('noDeadline') : formatDateTime(change.next),
          previous: change.previous === null ? t('noDeadline') : formatDateTime(change.previous),
        });
      case 'question_added':
        return t('change.questionAdded', { label: change.label });
      case 'question_removed':
        return t('change.questionRemoved', { label: change.label });
      case 'question_renamed':
        return t('change.questionRenamed', { next: change.next, previous: change.previous });
      case 'question_required_changed':
        return change.isRequired
          ? t('change.questionRequired', { label: change.label })
          : t('change.questionOptional', { label: change.label });
      case 'question_description_changed':
        return t('change.questionDescriptionChanged', { label: change.label });
      case 'question_options_changed':
        return t('change.questionOptionsChanged', { label: change.label });
      case 'question_settings_changed':
        return t('change.questionSettingsChanged', { label: change.label });
      case 'questions_reordered':
        return t('change.questionsReordered');
      case 'opened':
        return t('change.opened', { count: change.assignedCount });
      case 'closed':
        return t('change.closed', { reason: change.reason });
      case 'reopened':
        return t('change.reopened', { count: change.assignedCount, reason: change.reason });
    }
  }

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (isOpen) void loadFirstPage();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <HistoryIcon aria-hidden="true" data-icon="inline-start" />
            {t('action')}
          </Button>
        }
      />
      <DialogContent className="top-0 right-0 left-auto h-dvh w-full max-w-md translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 data-ending-style:translate-x-full data-ending-style:scale-100 data-starting-style:translate-x-full data-starting-style:scale-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t('close')}
              </Button>
            }
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.status === 'loading' ? (
            <div className="flex justify-center py-12">
              <Spinner aria-label={t('loading')} className="size-5" />
            </div>
          ) : state.status === 'failed' ? (
            <HistoryFailure message={t('loadFailed')} onRetry={loadFirstPage} retry={t('retry')} />
          ) : state.entries.length === 0 ? (
            <EmptyState description={t('emptyDescription')} icon={HistoryIcon} title={t('empty')} />
          ) : (
            <div className="flex flex-col gap-4">
              <ol aria-label={t('title')} className="flex flex-col gap-3">
                {state.entries.map((entry) => (
                  <li className="rounded-control border border-border bg-card p-3" key={entry.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="font-medium text-foreground">
                        {entry.actorName === '' ? t('unknownActor') : entry.actorName}
                      </p>
                      <time className="text-xs text-muted-foreground" dateTime={entry.occurredAt}>
                        {formatDateTime(entry.occurredAt)}
                      </time>
                    </div>
                    <ul className="mt-2 list-disc ps-5 text-sm text-muted-foreground">
                      {entry.changes.length === 0 ? (
                        <li>{t('noChanges')}</li>
                      ) : (
                        entry.changes.map((change, index) => (
                          <li className="break-words" key={index}>
                            {describeChange(change)}
                          </li>
                        ))
                      )}
                    </ul>
                  </li>
                ))}
              </ol>
              {state.more === 'failed' ? (
                <HistoryFailure
                  message={t('loadMoreFailed')}
                  onRetry={() => loadMore(state)}
                  retry={t('retry')}
                />
              ) : state.nextCursor === null ? null : (
                <Button
                  disabled={state.more === 'loading'}
                  onClick={() => void loadMore(state)}
                  type="button"
                  variant="outline"
                >
                  {state.more === 'loading' ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" role="presentation" />
                  ) : null}
                  {t('loadMore')}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryFailure({
  message,
  onRetry,
  retry,
}: {
  message: string;
  onRetry: () => Promise<void>;
  retry: string;
}) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        <Button onClick={() => void onRetry()} size="sm" type="button" variant="outline">
          {retry}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
