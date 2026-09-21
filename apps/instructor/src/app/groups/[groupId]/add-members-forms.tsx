'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { toast } from '@showcase/ui/toast';
import { Textarea } from '@showcase/ui/textarea';
import { CalendarPlusIcon, IdCardIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DisclosurePanel } from '@/components/ui/disclosure-panel';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { AddMembersAction, AddMembersActionState } from '../../collection-groups-state';
import { INITIAL_ADD_MEMBERS_STATE } from '../../collection-groups-state';

type AddMethod = 'entryYear' | 'studentIds';

/*
 * Adding members is one task with two methods, so it is one panel with a
 * method switch -- not two cards side by side asking the user to compare them.
 */
export function AddMembersPanel({
  addByEntryYearAction,
  addByStudentIdsAction,
}: {
  addByEntryYearAction: AddMembersAction;
  addByStudentIdsAction: AddMembersAction;
}) {
  const t = useTranslations('Groups');
  const [method, setMethod] = useState<AddMethod>('studentIds');
  const tablistLabel = t('members.methodLabel');

  return (
    <DisclosurePanel
      closeLabel={t('members.addClose')}
      openLabel={t('members.addOpen')}
      title={t('members.addTitle')}
    >
      <div className="flex flex-col gap-4">
        <div
          aria-label={tablistLabel}
          className="flex w-fit gap-1 rounded-control bg-muted p-1"
          role="tablist"
        >
          <MethodTab
            icon={IdCardIcon}
            isSelected={method === 'studentIds'}
            label={t('members.addByIdsTitle')}
            onSelect={() => setMethod('studentIds')}
          />
          <MethodTab
            icon={CalendarPlusIcon}
            isSelected={method === 'entryYear'}
            label={t('members.addByEntryYearTitle')}
            onSelect={() => setMethod('entryYear')}
          />
        </div>
        {method === 'studentIds' ? (
          <AddByStudentIdsForm action={addByStudentIdsAction} />
        ) : (
          <AddByEntryYearForm action={addByEntryYearAction} />
        )}
      </div>
    </DisclosurePanel>
  );
}

function MethodTab({
  icon: Icon,
  isSelected,
  label,
  onSelect,
}: {
  icon: typeof IdCardIcon;
  isSelected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-selected={isSelected}
      className={cn(
        'flex items-center gap-2 rounded-control px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none',
        isSelected
          ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(22,22,22,0.08)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function useAddMembersAction(action: AddMembersAction) {
  const errorT = useTranslations('Groups.errors');
  const router = useRouter();
  return useActionState(async (previousState: AddMembersActionState, formData: FormData) => {
    const nextState = await action(previousState, formData);
    if (nextState.error !== null) {
      toast.error(errorT(nextState.error));
    } else {
      router.refresh();
    }
    return nextState;
  }, INITIAL_ADD_MEMBERS_STATE);
}

export function AddByStudentIdsForm({ action }: { action: AddMembersAction }) {
  const t = useTranslations('Groups');
  const [state, formAction] = useAddMembersAction(action);
  const fieldId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={fieldId}>{t('members.studentIdsLabel')}</FieldLabel>
        <Textarea
          id={fieldId}
          name="studentIds"
          placeholder={t('members.studentIdsPlaceholder')}
          required
          rows={5}
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
      <div className="flex justify-end">
        <SubmitButton label={t('members.addByIds')} pendingLabel={t('saving')} />
      </div>
    </form>
  );
}

export function AddByEntryYearForm({ action }: { action: AddMembersAction }) {
  const t = useTranslations('Groups');
  const [state, formAction] = useAddMembersAction(action);
  const fieldId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field className="max-w-48">
        <FieldLabel htmlFor={fieldId}>{t('members.entryYearLabel')}</FieldLabel>
        <Input
          id={fieldId}
          inputMode="numeric"
          max={2700}
          min={2400}
          name="entryYear"
          required
          type="number"
        />
        <FieldDescription>{t('members.entryYearHelp')}</FieldDescription>
      </Field>
      {state.error === null && state.submitted ? (
        <ResultAlert
          acceptedCount={state.acceptedCount}
          alreadyWithdrawnCount={state.alreadyWithdrawnCount}
          unknownStudentIds={[]}
        />
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label={t('members.addByEntryYear')} pendingLabel={t('saving')} />
      </div>
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
  const hasExclusions =
    unknownStudentIds.length > 0 ||
    alreadyWithdrawnStudentIds.length > 0 ||
    alreadyWithdrawnCount > 0;
  return (
    <Alert variant={hasExclusions ? 'warning' : 'success'}>
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
        <AlertDescription>
          {t('alreadyWithdrawnCount', { count: alreadyWithdrawnCount })}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <Spinner aria-label={pendingLabel} data-icon="inline-start" />
      ) : (
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}
