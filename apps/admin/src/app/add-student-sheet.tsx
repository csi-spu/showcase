'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { UserPlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { RosterStudentAction, RosterStudentActionState } from './roster-student-state';
import { INITIAL_ROSTER_STUDENT_STATE } from './roster-student-state';

export function AddStudentSheet({ action }: { action: RosterStudentAction }) {
  const t = useTranslations('Accounts');
  const rosterT = useTranslations('Roster.single');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: RosterStudentActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(rosterT(`errors.${nextState.error}`));
      } else {
        toast.success(t('addStudent.success'));
        setOpen(false);
        router.refresh();
      }
      return nextState;
    },
    INITIAL_ROSTER_STUDENT_STATE,
  );

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger render={<Button size="lg" />}>
        <UserPlusIcon aria-hidden="true" data-icon="inline-start" />
        {t('addStudent.trigger')}
      </SheetTrigger>
      <SheetContent closeLabel={t('close')}>
        <SheetHeader>
          <SheetTitle>{t('addStudent.title')}</SheetTitle>
          <SheetDescription>{t('addStudent.description')}</SheetDescription>
        </SheetHeader>
        <form action={formAction} className="flex flex-col gap-5 p-4">
          <FieldSet aria-label={rosterT('groupLabel')}>
            <Field>
              <FieldLabel htmlFor="add-student-id">{rosterT('studentId')}</FieldLabel>
              <Input
                autoComplete="off"
                id="add-student-id"
                inputMode="numeric"
                maxLength={8}
                name="studentId"
                pattern="[0-9]{8}"
                required
              />
              <FieldDescription>{rosterT('studentIdHelp')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="add-student-first-name">{rosterT('firstName')}</FieldLabel>
              <Input id="add-student-first-name" maxLength={100} name="firstNameTh" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-student-last-name">{rosterT('lastName')}</FieldLabel>
              <Input id="add-student-last-name" maxLength={100} name="lastNameTh" required />
            </Field>
          </FieldSet>
          {state.error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription>{rosterT(`errors.${state.error}`)}</AlertDescription>
            </Alert>
          )}
          <SubmitButton label={rosterT('submit')} loading={rosterT('submitting')} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SubmitButton({ label, loading }: { label: string; loading: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="lg" type="submit">
      {pending ? <Spinner aria-label={loading} data-icon="inline-start" /> : null}
      {pending ? loading : label}
    </Button>
  );
}
