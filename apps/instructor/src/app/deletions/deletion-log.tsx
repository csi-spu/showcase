'use client';

import { Button } from '@showcase/ui/button';
import { Textarea } from '@showcase/ui/textarea';
import { toast } from '@showcase/ui/toast';
import {
  CalendarRangeIcon,
  FileTextIcon,
  HistoryIcon,
  RotateCcwIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  RESTORE_REASON_MAX_LENGTH,
  type CollectionDeletionKind,
  type CollectionDeletionLogEntry,
  type CollectionDeletionLogPage,
  type DeletionLogReadResult,
} from '@/lib/instructor-collection-deletions-contract';
import {
  INITIAL_RESTORE_COLLECTION_DELETION_STATE,
  type RestoreCollectionDeletionActionState,
} from '../collection-deletions-state';

/** Stored in UTC, read in the timezone Instructors work in. */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

const KIND_ICONS: Record<CollectionDeletionKind, LucideIcon> = {
  form: FileTextIcon,
  group: UsersIcon,
  round: CalendarRangeIcon,
};

function formatDateTime(value: string): string {
  return DATE_TIME_FORMAT.format(new Date(value));
}

type RestoreAction = (
  deletionId: string,
  previousState: RestoreCollectionDeletionActionState,
  formData: FormData,
) => Promise<RestoreCollectionDeletionActionState>;

interface LogState {
  entries: CollectionDeletionLogEntry[];
  /* Reading the next page, or reading the first page again after a restore. */
  more: 'failed' | 'idle' | 'loading';
  nextCursor: string | null;
  reload: 'failed' | 'idle' | 'loading';
}

/**
 * Every deletion, newest first, with who deleted and restored it.
 *
 * The server renders the first page; "ดูเพิ่มเติม" reads the next one. A
 * restore reads the first page again, so every entry's availability reflects
 * the restore (a restored group lets its earlier form deletions restore).
 */
export function DeletionLog({
  initialPage,
  readPage,
  restoreAction,
}: {
  initialPage: CollectionDeletionLogPage;
  readPage: (cursor: string | null) => Promise<DeletionLogReadResult>;
  restoreAction: RestoreAction;
}) {
  const t = useTranslations('Deletions.log');
  const [state, setState] = useState<LogState>({
    entries: initialPage.entries,
    more: 'idle',
    nextCursor: initialPage.nextCursor,
    reload: 'idle',
  });
  /* Only the latest read may land; a slower earlier one is dropped. */
  const latestRead = useRef(0);

  async function loadMore() {
    if (state.nextCursor === null) return;
    const read = ++latestRead.current;
    setState((current) => ({ ...current, more: 'loading' }));
    const result = await readPage(state.nextCursor);
    if (read !== latestRead.current) return;
    setState((current) =>
      result.ok
        ? {
            entries: [...current.entries, ...result.page.entries],
            more: 'idle',
            nextCursor: result.page.nextCursor,
            reload: 'idle',
          }
        : { ...current, more: 'failed' },
    );
  }

  async function reloadFirstPage() {
    const read = ++latestRead.current;
    setState((current) => ({ ...current, more: 'idle', reload: 'loading' }));
    const result = await readPage(null);
    if (read !== latestRead.current) return;
    setState((current) =>
      result.ok
        ? {
            entries: result.page.entries,
            more: 'idle',
            nextCursor: result.page.nextCursor,
            reload: 'idle',
          }
        : { ...current, reload: 'failed' },
    );
  }

  if (state.entries.length === 0) {
    return <EmptyState description={t('emptyDescription')} icon={HistoryIcon} title={t('empty')} />;
  }

  return (
    <div aria-busy={state.reload === 'loading'} className="flex flex-col gap-4">
      {state.reload === 'failed' ? (
        <LogFailure message={t('loadFailed')} onRetry={reloadFirstPage} retry={t('retry')} />
      ) : null}
      <ol aria-label={t('listLabel')} className="flex list-none flex-col gap-3 p-0">
        {state.entries.map((entry) => (
          <DeletionEntry
            entry={entry}
            key={entry.id}
            onRestored={() => void reloadFirstPage()}
            restoreAction={restoreAction}
          />
        ))}
      </ol>
      {state.more === 'failed' ? (
        <LogFailure message={t('loadMoreFailed')} onRetry={loadMore} retry={t('retry')} />
      ) : state.nextCursor === null ? null : (
        <Button
          className="self-center"
          disabled={state.more === 'loading' || state.reload === 'loading'}
          onClick={() => void loadMore()}
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
  );
}

function DeletionEntry({
  entry,
  onRestored,
  restoreAction,
}: {
  entry: CollectionDeletionLogEntry;
  onRestored: () => void;
  restoreAction: RestoreAction;
}) {
  const t = useTranslations('Deletions.log');
  const Icon = KIND_ICONS[entry.kind];
  const counts = {
    assigned: entry.counts.assignedStudentCount,
    formCount: entry.counts.formCount,
    groupCount: entry.counts.groupCount,
    submitted: entry.counts.submittedStudentCount,
  };

  return (
    <li className="flex flex-col gap-3 rounded-surface border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium break-words text-foreground">
            {entry.kind === 'round'
              ? t('entryRound', { name: entry.name })
              : entry.kind === 'group'
                ? t('entryGroup', { name: entry.name, round: entry.roundName ?? '' })
                : t('entryForm', {
                    group: entry.groupName ?? '',
                    name: entry.name,
                    round: entry.roundName ?? '',
                  })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('deletedBy', {
              name: entry.deletedByName === '' ? t('unknownActor') : entry.deletedByName,
              time: formatDateTime(entry.deletedAt),
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {entry.kind === 'round'
              ? t('countsRound', counts)
              : entry.kind === 'group'
                ? t('countsGroup', counts)
                : t('countsForm', counts)}
          </p>
          {entry.restore === null ? null : (
            <div className="mt-1 flex flex-col gap-1 rounded-control bg-muted/60 p-2.5 text-sm">
              <StatusBadge icon={RotateCcwIcon} tone="success">
                {t('restored')}
              </StatusBadge>
              <p className="text-muted-foreground">
                {t('restoredBy', {
                  name:
                    entry.restore.restoredByName === ''
                      ? t('unknownActor')
                      : entry.restore.restoredByName,
                  time: formatDateTime(entry.restore.restoredAt),
                })}
              </p>
              <p className="break-words whitespace-pre-line text-foreground">
                {t('restoreReason', { reason: entry.restore.reason })}
              </p>
            </div>
          )}
        </div>
      </div>
      <RestoreControl entry={entry} onRestored={onRestored} restoreAction={restoreAction} />
    </li>
  );
}

function RestoreControl({
  entry,
  onRestored,
  restoreAction,
}: {
  entry: CollectionDeletionLogEntry;
  onRestored: () => void;
  restoreAction: RestoreAction;
}) {
  const t = useTranslations('Deletions.restore');
  const hintId = useId();
  const availability = entry.restoreAvailability;
  if (availability.status === 'already_restored') return null;
  if (availability.status === 'available') {
    return <RestoreDialog entry={entry} onRestored={onRestored} restoreAction={restoreAction} />;
  }
  const hint =
    availability.status === 'round_closed'
      ? t('unavailableRoundClosed')
      : availability.ancestorKind === 'round'
        ? t('unavailableRound', { name: availability.ancestorName })
        : t('unavailableGroup', { name: availability.ancestorName });
  /* Stays focusable while disabled, so keyboard users reach the tooltip too. */
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-describedby={hintId}
            aria-label={t('actionLabel', { name: entry.name })}
            className="shrink-0 self-start data-disabled:cursor-not-allowed data-disabled:bg-disabled data-disabled:text-disabled-foreground"
            disabled
            focusableWhenDisabled
            size="sm"
            type="button"
            variant="outline"
          />
        }
      >
        <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
        {t('action')}
        <span className="sr-only" id={hintId}>
          {hint}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function RestoreDialog({
  entry,
  onRestored,
  restoreAction,
}: {
  entry: CollectionDeletionLogEntry;
  onRestored: () => void;
  restoreAction: RestoreAction;
}) {
  const t = useTranslations('Deletions.restore');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button
            aria-label={t('actionLabel', { name: entry.name })}
            className="shrink-0 self-start"
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
            {t('action')}
          </Button>
        }
      />
      <AlertDialogContent>
        <RestoreForm
          entry={entry}
          onRestored={() => {
            setIsOpen(false);
            onRestored();
          }}
          restoreAction={restoreAction}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* Mounted with each opening, so the reason and the last refusal start empty. */
function RestoreForm({
  entry,
  onRestored,
  restoreAction,
}: {
  entry: CollectionDeletionLogEntry;
  onRestored: () => void;
  restoreAction: RestoreAction;
}) {
  const t = useTranslations('Deletions.restore');
  const errorT = useTranslations('Deletions.errors');
  const formId = useId();
  const reasonId = useId();
  /* Controlled, so a refused restore keeps the reason. */
  const [reason, setReason] = useState('');
  const [state, formAction, isPending] = useActionState(
    async (previousState: RestoreCollectionDeletionActionState, formData: FormData) => {
      const nextState = await restoreAction(entry.id, previousState, formData);
      if (nextState.isRestored) {
        toast.success(t('success', { name: entry.name }));
        onRestored();
      }
      return nextState;
    },
    INITIAL_RESTORE_COLLECTION_DELETION_STATE,
  );

  function errorMessage(error: NonNullable<RestoreCollectionDeletionActionState['error']>) {
    if (error === 'roundClosed') return t('unavailableRoundClosed');
    if (error === 'ancestorDeleted' && state.ancestor !== null) {
      return state.ancestor.kind === 'round'
        ? t('unavailableRound', { name: state.ancestor.name })
        : t('unavailableGroup', { name: state.ancestor.name });
    }
    return errorT(error);
  }

  return (
    <>
      <AlertDialogTitle className="break-words">
        {t('title', { name: entry.name })}
      </AlertDialogTitle>
      <AlertDialogDescription>{t('description')}</AlertDialogDescription>
      <form action={formAction} className="flex flex-col gap-4" id={formId}>
        <Field>
          <FieldLabel htmlFor={reasonId}>{t('reasonLabel')}</FieldLabel>
          <Textarea
            id={reasonId}
            maxLength={RESTORE_REASON_MAX_LENGTH}
            name="reason"
            onChange={(event) => setReason(event.target.value)}
            required
            rows={3}
            value={reason}
          />
          <FieldDescription>{t('reasonHint')}</FieldDescription>
        </Field>
        {state.error === null ? null : (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(state.error)}</AlertDescription>
          </Alert>
        )}
      </form>
      <AlertDialogFooter>
        <AlertDialogClose
          render={
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          }
        />
        <Button disabled={reason.trim() === '' || isPending} form={formId} type="submit">
          {isPending ? (
            <Spinner aria-hidden="true" data-icon="inline-start" role="presentation" />
          ) : (
            <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {isPending ? t('restoring') : t('confirm')}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

function LogFailure({
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
