'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@showcase/ui/textarea';
import type { AddMembersAction, AddMembersActionState } from '../../collection-groups-state';
import { INITIAL_ADD_MEMBERS_STATE } from '../../collection-groups-state';

export function AddByStudentIdsForm({ action }: { action: AddMembersAction }) {
  const t = useTranslations('Groups');
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  const [state, formAction] = useActionState(async (
    previousState: AddMembersActionState,
    formData: FormData,
  ) => {
    const nextState = await action(previousState, formData);
    if (nextState.error !== null) {
      toast.error(errorT(nextState.error));
    } else {
      router.refresh();
    }
    return nextState;
  }, INITIAL_ADD_MEMBERS_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="student-ids">{t('members.studentIdsLabel')}</FieldLabel>
        <Textarea
          id="student-ids"
          name="studentIds"
          placeholder={t('members.studentIdsPlaceholder')}
          required
        />
        <FieldDescription>{t('members.studentIdsHelp')}</FieldDescription>
      </Field>
      {state.error === null && state.submitted ? (
        <ResultAlert
          acceptedCount={state.acceptedCount}
          alreadyWithdrawnStudentIds={state.alreadyWithdrawnStudentIds}
          unknownStudentIds={state.unknownStudentIds}
        />
      ) : null}
      <SubmitButton label={t('members.addByIds')} pendingLabel={t('saving')} />
    </form>
  );
}

export function AddByEntryYearForm({ action }: { action: AddMembersAction }) {
  const t = useTranslations('Groups');
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  const [state, formAction] = useActionState(async (
    previousState: AddMembersActionState,
    formData: FormData,
  ) => {
    const nextState = await action(previousState, formData);
    if (nextState.error !== null) {
      toast.error(errorT(nextState.error));
    } else {
      router.refresh();
    }
    return nextState;
  }, INITIAL_ADD_MEMBERS_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field className="w-40">
        <FieldLabel htmlFor="entry-year">{t('members.entryYearLabel')}</FieldLabel>
        <Input id="entry-year" inputMode="numeric" max={2700} min={2400} name="entryYear" required type="number" />
      </Field>
      <SubmitButton label={t('members.addByEntryYear')} pendingLabel={t('saving')} />
      {state.error === null && state.submitted ? (
        <div className="w-full">
          <ResultAlert
            acceptedCount={state.acceptedCount}
            alreadyWithdrawnCount={state.alreadyWithdrawnCount}
            unknownStudentIds={[]}
          />
        </div>
      ) : null}
    </form>
  );
}

function ResultAlert({
  acceptedCount,
  alreadyWithdrawnCount = 0,
  alreadyWithdrawnStudentIds = [],
  unknownStudentIds,
}: {
  acceptedCount: number;
  alreadyWithdrawnCount?: number;
  alreadyWithdrawnStudentIds?: string[];
  unknownStudentIds: string[];
}) {
  const t = useTranslations('Groups.members');
  return (
    <Alert>
      <UsersIcon aria-hidden="true" />
      <AlertTitle>{t('addResultTitle', { count: acceptedCount })}</AlertTitle>
      {unknownStudentIds.length > 0 ? (
        <AlertDescription>
          {t('unknownIds')}: {unknownStudentIds.join(', ')}
        </AlertDescription>
      ) : null}
      {alreadyWithdrawnStudentIds.length > 0 ? (
        <AlertDescription>
          {t('alreadyWithdrawnIds')}: {alreadyWithdrawnStudentIds.join(', ')}
        </AlertDescription>
      ) : null}
      {alreadyWithdrawnStudentIds.length === 0 && alreadyWithdrawnCount > 0 ? (
        <AlertDescription>{t('alreadyWithdrawnCount', { count: alreadyWithdrawnCount })}</AlertDescription>
      ) : null}
    </Alert>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-label={pendingLabel} data-icon="inline-start" /> : <PlusIcon aria-hidden="true" data-icon="inline-start" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
