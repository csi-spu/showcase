'use client';

import { LockIcon, UnlockIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@showcase/ui/button';
import { Textarea } from '@showcase/ui/textarea';
import { toast } from '@showcase/ui/toast';
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  INITIAL_FORM_ACTION_STATE,
  type CollectionFormActionState,
} from '@/app/collection-forms-state';
import type { InstructorPendingWork } from '@/lib/instructor-collection-forms-contract';

type RoundAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

/**
 * Closing or reopening a whole round.
 *
 * Closing stops every write in the round, which is broader than closing a
 * single form, so the confirmation shows the work still outstanding. The counts
 * do not block the decision -- an Instructor may legitimately close a round
 * with work pending -- but they must be seen before it is made.
 */
export function RoundLifecyclePanel({
  closeAction,
  isActive,
  pendingWork,
  reopenAction,
}: {
  closeAction: RoundAction;
  isActive: boolean;
  pendingWork: InstructorPendingWork | null;
  reopenAction: RoundAction;
}) {
  const t = useTranslations('Groups.round');

  return isActive ? (
    <RoundLifecycleDialog
      action={closeAction}
      confirmLabel={t('closeConfirm')}
      description={t('closeConfirmDescription')}
      icon={LockIcon}
      pendingWork={pendingWork}
      successMessage={t('closedSuccess')}
      title={t('closeConfirmTitle')}
      triggerLabel={t('close')}
    />
  ) : (
    <RoundLifecycleDialog
      action={reopenAction}
      confirmLabel={t('reopenConfirm')}
      description={t('reopenConfirmDescription')}
      icon={UnlockIcon}
      pendingWork={null}
      successMessage={t('reopenedSuccess')}
      title={t('reopenConfirmTitle')}
      triggerLabel={t('reopen')}
    />
  );
}

function RoundLifecycleDialog({
  action,
  confirmLabel,
  description,
  icon: Icon,
  pendingWork,
  successMessage,
  title,
  triggerLabel,
}: {
  action: RoundAction;
  confirmLabel: string;
  description: string;
  icon: typeof LockIcon;
  pendingWork: InstructorPendingWork | null;
  successMessage: string;
  title: string;
  triggerLabel: string;
}) {
  const t = useTranslations('Groups.round');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const reasonId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      setIsOpen(false);
      toast.success(successMessage);
      router.refresh();
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <Icon aria-hidden="true" data-icon="inline-start" />
            {triggerLabel}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {pendingWork === null ? null : (
          <Alert variant={pendingWork.total === 0 ? 'information' : 'warning'}>
            <AlertDescription>
              {pendingWork.total === 0 ? (
                t('pendingNone')
              ) : (
                <>
                  <span className="font-medium">{t('pendingHeading')}</span>
                  <ul className="mt-1 flex list-none flex-col gap-0.5 p-0">
                    <li>{t('pendingNotSubmitted', { count: pendingWork.notSubmitted })}</li>
                    <li>{t('pendingAwaitingChecking', { count: pendingWork.awaitingChecking })}</li>
                    <li>{t('pendingChangesRequired', { count: pendingWork.changesRequired })}</li>
                  </ul>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
        <form action={formAction} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={reasonId}>{t('lifecycleReason')}</FieldLabel>
            <Textarea id={reasonId} name="reason" required />
            <FieldDescription>{t('lifecycleReasonHint')}</FieldDescription>
          </Field>
          {state.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('createClose')}</Button>} />
            <SubmitButton label={confirmLabel} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}
