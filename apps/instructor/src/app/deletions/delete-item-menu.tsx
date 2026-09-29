'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { MoreHorizontalIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useRef, useState, type RefObject } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CONFIRMATION_NAME_MAX_LENGTH,
  type CollectionDeletionKind,
  type CollectionDeletionPreview,
} from '@/lib/instructor-collection-deletions-contract';
import {
  deleteCollectionItemAction,
  previewCollectionDeletionAction,
} from '../collection-deletions.actions';
import {
  INITIAL_DELETE_COLLECTION_ITEM_STATE,
  type DeleteCollectionItemActionState,
} from '../collection-deletions-state';

type PreviewState =
  | { status: 'loading' }
  | { error: 'notFound' | 'unavailable'; status: 'failed' }
  | { preview: CollectionDeletionPreview; status: 'loaded' };

/**
 * The "⋯" menu for a round, group, or form, and the dialog that deletes it.
 *
 * The dialog reads what the delete would remove when it opens, and the delete
 * stays disabled until the Instructor types the item's exact name. A group or
 * form in a closed round cannot be deleted; the disabled item says why.
 * `redirectTo` is the nearest live parent when the item's own page is open.
 */
export function DeleteItemMenu({
  id,
  isRoundClosed,
  kind,
  name,
  redirectTo = null,
}: {
  id: string;
  isRoundClosed: boolean;
  kind: CollectionDeletionKind;
  name: string;
  redirectTo?: string | null;
}) {
  const t = useTranslations('Deletions');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });
  /* Only the latest read may land; a slower earlier one is dropped. */
  const latestRead = useRef(0);
  const isBlocked = isRoundClosed && kind !== 'round';

  async function loadPreview() {
    const read = ++latestRead.current;
    setPreview({ status: 'loading' });
    const result = await previewCollectionDeletionAction(kind, id);
    if (read !== latestRead.current) return;
    setPreview(
      result.ok
        ? { preview: result.preview, status: 'loaded' }
        : { error: result.error, status: 'failed' },
    );
  }

  function openDialog() {
    setIsOpen(true);
    void loadPreview();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={triggerRef}
          render={
            <Button
              aria-label={t('menu.label', { name })}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent>
          {isBlocked ? (
            <BlockedDeleteItem hint={t('menu.roundClosedHint')} label={t('menu.delete')} />
          ) : (
            <DropdownMenuItem onClick={openDialog} variant="destructive">
              <Trash2Icon aria-hidden="true" />
              {t('menu.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
        <AlertDialogContent finalFocus={triggerRef} initialFocus={cancelRef}>
          <DeleteDialogBody
            cancelRef={cancelRef}
            id={id}
            kind={kind}
            name={name}
            onDeleted={() => setIsOpen(false)}
            onRetry={() => void loadPreview()}
            preview={preview}
            redirectTo={redirectTo}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/*
 * Disabled items stay focusable in the menu, so the tooltip reaches keyboard
 * users too; the hint is also the item's description for screen readers.
 */
function BlockedDeleteItem({ hint, label }: { hint: string; label: string }) {
  const hintId = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        render={<DropdownMenuItem aria-describedby={hintId} disabled variant="destructive" />}
      >
        <Trash2Icon aria-hidden="true" />
        {label}
        <span className="sr-only" id={hintId}>
          {hint}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{hint}</TooltipContent>
    </Tooltip>
  );
}

/*
 * Mounted with each opening, so the typed name and the last refusal start
 * empty. The footer stays put while the preview loads, keeping focus on
 * "ยกเลิก".
 */
function DeleteDialogBody({
  cancelRef,
  id,
  kind,
  name,
  onDeleted,
  onRetry,
  preview,
  redirectTo,
}: {
  cancelRef: RefObject<HTMLButtonElement | null>;
  id: string;
  kind: CollectionDeletionKind;
  name: string;
  onDeleted: () => void;
  onRetry: () => void;
  preview: PreviewState;
  redirectTo: string | null;
}) {
  const t = useTranslations('Deletions');
  const router = useRouter();
  const formId = useId();
  const inputId = useId();
  /* Controlled, so a refused delete keeps what was typed. */
  const [typed, setTyped] = useState('');
  const [state, formAction, isPending] = useActionState(
    async (previousState: DeleteCollectionItemActionState, formData: FormData) => {
      const nextState = await deleteCollectionItemAction(kind, id, previousState, formData);
      if (nextState.error !== null) return nextState;
      toast.success(
        t('dialog.success', { name: preview.status === 'loaded' ? preview.preview.name : name }),
        {
          action: { label: t('dialog.viewLog'), onClick: () => router.push('/deletions') },
        },
      );
      onDeleted();
      if (redirectTo === null) router.refresh();
      else router.replace(redirectTo);
      return nextState;
    },
    INITIAL_DELETE_COLLECTION_ITEM_STATE,
  );
  const loaded = preview.status === 'loaded' ? preview.preview : null;
  const canDelete = loaded !== null && loaded.blockedReason === null;

  return (
    <>
      <AlertDialogTitle className="flex items-start gap-2">
        <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <span className="min-w-0 break-words">
          {t('dialog.title', { name: loaded?.name ?? name })}
        </span>
      </AlertDialogTitle>
      {preview.status === 'loading' ? (
        <div className="flex justify-center py-6">
          <Spinner aria-label={t('dialog.loading')} className="size-5" />
        </div>
      ) : preview.status === 'failed' ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {preview.error === 'notFound' ? t('errors.notFound') : t('dialog.loadFailed')}
            </span>
            {preview.error === 'notFound' ? null : (
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                {t('dialog.retry')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <DeletionImpact kind={kind} preview={preview.preview} />
          {canDelete ? (
            <form action={formAction} className="flex flex-col gap-4" id={formId}>
              <Field>
                <FieldLabel htmlFor={inputId}>
                  {t('dialog.confirmLabel', { name: preview.preview.name })}
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id={inputId}
                  maxLength={CONFIRMATION_NAME_MAX_LENGTH}
                  name="confirmationName"
                  onChange={(event) => setTyped(event.target.value)}
                  spellCheck={false}
                  value={typed}
                />
                <FieldDescription>{t('dialog.confirmHint')}</FieldDescription>
              </Field>
              {state.error === null ? null : (
                <Alert variant="destructive">
                  <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
                </Alert>
              )}
            </form>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{t('errors.roundClosed')}</AlertDescription>
            </Alert>
          )}
        </>
      )}
      <AlertDialogFooter>
        <AlertDialogClose
          ref={cancelRef}
          render={
            <Button type="button" variant="outline">
              {t('dialog.cancel')}
            </Button>
          }
        />
        {canDelete ? (
          <Button
            disabled={typed.trim() !== loaded.name || isPending}
            form={formId}
            type="submit"
            variant="destructive"
          >
            {isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" role="presentation" />
            ) : (
              <Trash2Icon aria-hidden="true" data-icon="inline-start" />
            )}
            {isPending ? t('dialog.deleting') : t('dialog.confirm')}
          </Button>
        ) : null}
      </AlertDialogFooter>
    </>
  );
}

function DeletionImpact({
  kind,
  preview,
}: {
  kind: CollectionDeletionKind;
  preview: CollectionDeletionPreview;
}) {
  const t = useTranslations('Deletions');
  const { counts } = preview;
  return (
    <AlertDialogDescription className="flex flex-col gap-2">
      {preview.round === null ? null : (
        <span>
          {preview.group === null
            ? t('dialog.inRound', { round: preview.round.name })
            : t('dialog.inGroup', { group: preview.group.name, round: preview.round.name })}
        </span>
      )}
      <span className="text-foreground">
        {kind === 'round'
          ? t('dialog.impactRound', { formCount: counts.formCount, groupCount: counts.groupCount })
          : kind === 'group'
            ? t('dialog.impactGroup', { formCount: counts.formCount })
            : t('dialog.impactForm')}{' '}
        {t('dialog.impactStudents', {
          assigned: counts.assignedStudentCount,
          submitted: counts.submittedStudentCount,
        })}
      </span>
      <span>{t('dialog.impactHidden')}</span>
    </AlertDialogDescription>
  );
}
