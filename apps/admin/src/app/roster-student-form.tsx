'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { UserPlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { RosterStudentActionState, RosterStudentAction } from './roster-student-state';
import { INITIAL_ROSTER_STUDENT_STATE } from './roster-student-state';

export function RosterStudentForm({ action }: { action: RosterStudentAction }) {
  const t = useTranslations('Roster.single');
  const [state, formAction] = useActionState(
    async (previousState: RosterStudentActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) toast.error(t(`errors.${nextState.error}`));
      return nextState;
    },
    INITIAL_ROSTER_STUDENT_STATE,
  );
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error !== null) errorRef.current?.focus();
  }, [state.error]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FieldSet aria-label={t('groupLabel')}>
        <Field>
          <FieldLabel htmlFor="roster-student-id">{t('studentId')}</FieldLabel>
          <Input
            autoComplete="off"
            id="roster-student-id"
            inputMode="numeric"
            maxLength={8}
            name="studentId"
            pattern="[0-9]{8}"
            required
          />
          <FieldDescription>{t('studentIdHelp')}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="roster-first-name">{t('firstName')}</FieldLabel>
          <Input id="roster-first-name" maxLength={100} name="firstNameTh" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="roster-last-name">{t('lastName')}</FieldLabel>
          <Input id="roster-last-name" maxLength={100} name="lastNameTh" required />
        </Field>
      </FieldSet>
      {state.error === null ? null : (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const t = useTranslations('Roster.single');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="lg" type="submit">
      {pending ? (
        <Spinner aria-label={t('submitting')} data-icon="inline-start" />
      ) : (
        <UserPlusIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? t('submitting') : t('submit')}
    </Button>
  );
}
