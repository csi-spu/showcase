'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { CalendarClockIcon, KeyRoundIcon, SearchIcon, UserRoundCogIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type {
  AcademicYearAction,
  AcademicYearSettingsState,
  StudentAccountAction,
  StudentAccountControlsState,
} from './account-controls-state';

export function AccountControlsPanel({
  academicYear,
  academicYearAction,
  academicYearIdempotencyKey,
  mode = 'all',
  studentAction,
  studentIdempotencyKey,
}: {
  academicYear: AcademicYearSettingsState | null;
  academicYearAction: AcademicYearAction;
  academicYearIdempotencyKey: string;
  mode?: 'academic-year' | 'all' | 'student';
  studentAction: StudentAccountAction;
  studentIdempotencyKey: string;
}) {
  const t = useTranslations('AccountControls');
  const [yearState, yearFormAction] = useActionState(academicYearAction, {
    error: null,
    idempotencyKey: academicYearIdempotencyKey,
    settings: academicYear,
  });
  const [studentState, studentFormAction] = useActionState(studentAction, {
    error: null,
    idempotencyKey: studentIdempotencyKey,
    student: null,
    temporaryPassword: null,
  });

  return (
    <section
      aria-label={
        mode === 'academic-year'
          ? t('year.title')
          : mode === 'student'
            ? t('student.title')
            : t('title')
      }
      className={cn('flex flex-col gap-6', mode === 'all' ? 'max-w-6xl' : 'max-w-3xl')}
    >
      <div className={cn('grid grid-cols-1 gap-6', mode === 'all' && 'xl:grid-cols-12')}>
        {mode === 'student' ? null : (
          <Card className={cn(mode === 'all' && 'xl:col-span-5')}>
            <CardHeader>
              <CalendarClockIcon aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>{t('year.title')}</CardTitle>
              <CardDescription>{t('year.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={yearFormAction} className="flex flex-col gap-5">
                <div className="rounded-card border border-border bg-muted p-4">
                  <p className="text-sm text-muted-foreground">{t('year.current')}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {yearState.settings?.currentAcademicYear ?? t('year.missing')}
                  </p>
                  {yearState.settings ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('year.updatedAt', {
                        value: formatBangkokDate(yearState.settings.updatedAt),
                      })}
                    </p>
                  ) : null}
                </div>
                <input
                  name="expectedVersion"
                  type="hidden"
                  value={yearState.settings?.version ?? 0}
                />
                <input name="idempotencyKey" type="hidden" value={yearState.idempotencyKey} />
                <Field>
                  <FieldLabel htmlFor="current-academic-year">{t('year.input')}</FieldLabel>
                  <Input
                    defaultValue={yearState.settings?.currentAcademicYear ?? ''}
                    id="current-academic-year"
                    key={yearState.settings?.version ?? 0}
                    max={2700}
                    min={2400}
                    name="currentAcademicYear"
                    required
                    type="number"
                  />
                  <FieldDescription>{t('year.help')}</FieldDescription>
                </Field>
                <ActionFeedback error={yearState.error} />
                {yearState.error === null && yearState.settings !== academicYear ? (
                  <Alert className="border-success/30 bg-success-background text-success">
                    <AlertDescription>{t('year.success')}</AlertDescription>
                  </Alert>
                ) : null}
                <SubmitButton icon="calendar" label={t('year.submit')} loading={t('saving')} />
              </form>
            </CardContent>
          </Card>
        )}

        {mode === 'academic-year' ? null : (
          <Card className={cn(mode === 'all' && 'xl:col-span-7')}>
            <CardHeader>
              <UserRoundCogIcon aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>{t('student.title')}</CardTitle>
              <CardDescription>{t('student.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <form action={studentFormAction} className="flex flex-col gap-4">
                <input name="operation" type="hidden" value="lookup" />
                <Field>
                  <FieldLabel htmlFor="account-student-id">{t('student.studentId')}</FieldLabel>
                  <Input
                    autoComplete="off"
                    id="account-student-id"
                    inputMode="numeric"
                    maxLength={8}
                    name="studentId"
                    pattern="[0-9]{8}"
                    required
                  />
                  <FieldDescription>{t('student.studentIdHelp')}</FieldDescription>
                </Field>
                {studentState.student === null ? (
                  <ActionFeedback error={studentState.error} />
                ) : null}
                <SubmitButton icon="search" label={t('student.search')} loading={t('searching')} />
              </form>

              {studentState.student === null ? null : (
                <StudentControls
                  action={studentFormAction}
                  error={studentState.error}
                  idempotencyKey={studentState.idempotencyKey}
                  student={studentState.student}
                  temporaryPassword={studentState.temporaryPassword}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function StudentControls({
  action,
  error,
  idempotencyKey,
  student,
  temporaryPassword,
}: {
  action: (payload: FormData) => void;
  error: Parameters<typeof ActionFeedback>[0]['error'];
  idempotencyKey: string;
  student: StudentAccountControlsState;
  temporaryPassword: string | null;
}) {
  const t = useTranslations('AccountControls');
  const [activeControl, setActiveControl] = useState<'extension' | 'name' | 'reset' | null>(null);
  return (
    <div className="flex flex-col gap-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{`${student.firstNameTh} ${student.lastNameTh}`}</p>
          <p className="text-sm text-muted-foreground">
            {t('student.entryYear', { year: student.entryYear })}
          </p>
        </div>
        <span className="rounded-full bg-warning-background px-3 py-1 text-sm font-medium text-warning">
          {t(`student.state.${student.state}`)}
        </span>
      </div>
      <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2">
        <PeriodValue label={t('student.accessEnds')} value={student.accessEndsAcademicYear} />
        <PeriodValue
          label={t('student.currentYear')}
          value={student.currentAcademicYear ?? t('year.missing')}
        />
      </dl>
      <ActionFeedback error={error} />
      {temporaryPassword === null ? null : (
        <Alert className="border-success/30 bg-success-background text-success">
          <AlertTitle>{t('reset.success')}</AlertTitle>
          <AlertDescription>
            <p>{t('reset.once')}</p>
            <code className="mt-3 block select-all rounded-control border border-success/30 bg-card p-3 text-base text-foreground">
              {temporaryPassword}
            </code>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Button onClick={() => setActiveControl('name')} type="button" variant="outline">
          {t('name.title')}
        </Button>
        <Button onClick={() => setActiveControl('extension')} type="button" variant="outline">
          {t('extension.title')}
        </Button>
        <Button onClick={() => setActiveControl('reset')} type="button" variant="outline">
          <KeyRoundIcon aria-hidden="true" data-icon="inline-start" />
          {t('reset.submit')}
        </Button>
      </div>
      {activeControl === 'name' ? (
        <FieldSet aria-label={t('name.title')}>
          <form
            action={action}
            className="flex flex-col gap-4 rounded-card border border-border p-4"
            key={student.version}
          >
            <input name="operation" type="hidden" value="correctName" />
            <MutationFields
              idempotencyKey={idempotencyKey}
              studentAccountId={student.accountId}
              version={student.version}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="student-first-name">{t('name.firstName')}</FieldLabel>
                <Input
                  defaultValue={student.firstNameTh}
                  id="student-first-name"
                  maxLength={100}
                  name="firstNameTh"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="student-last-name">{t('name.lastName')}</FieldLabel>
                <Input
                  defaultValue={student.lastNameTh}
                  id="student-last-name"
                  maxLength={100}
                  name="lastNameTh"
                  required
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="student-name-reason">{t('name.reason')}</FieldLabel>
              <Textarea
                className="min-h-28"
                id="student-name-reason"
                maxLength={2000}
                name="reason"
                required
              />
              <FieldDescription>{t('name.reasonHelp')}</FieldDescription>
            </Field>
            <SubmitButton label={t('name.submit')} loading={t('saving')} />
          </form>
        </FieldSet>
      ) : null}
      {activeControl === 'extension' ? (
        <FieldSet aria-label={t('extension.title')}>
          <form
            action={action}
            className="flex flex-col gap-4 rounded-card border border-border p-4"
          >
            <input name="operation" type="hidden" value="extend" />
            <MutationFields
              idempotencyKey={idempotencyKey}
              studentAccountId={student.accountId}
              version={student.version}
            />
            <Field>
              <FieldLabel htmlFor="access-ends-academic-year">{t('extension.year')}</FieldLabel>
              <Input
                defaultValue={Math.min(student.accessEndsAcademicYear + 1, 2700)}
                id="access-ends-academic-year"
                max={2700}
                min={student.accessEndsAcademicYear}
                name="accessEndsAcademicYear"
                required
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="access-extension-reason">{t('extension.reason')}</FieldLabel>
              <Textarea
                className="min-h-28"
                id="access-extension-reason"
                maxLength={2000}
                name="reason"
                required
              />
              <FieldDescription>{t('extension.reasonHelp')}</FieldDescription>
            </Field>
            <SubmitButton label={t('extension.submit')} loading={t('saving')} />
          </form>
        </FieldSet>
      ) : null}
      {activeControl === 'reset' ? (
        <form
          action={action}
          className="flex flex-col gap-3 rounded-card border border-warning/30 bg-warning-background p-4"
        >
          <input name="operation" type="hidden" value="reset" />
          <MutationFields
            idempotencyKey={idempotencyKey}
            studentAccountId={student.accountId}
            version={student.version}
          />
          <p className="text-sm text-muted-foreground">{t('reset.description')}</p>
          <SubmitButton
            icon="key"
            label={t('reset.confirm')}
            loading={t('reset.loading')}
            variant="outline"
          />
        </form>
      ) : null}
    </div>
  );
}

function MutationFields({
  idempotencyKey,
  studentAccountId,
  version,
}: {
  idempotencyKey: string;
  studentAccountId: string;
  version: number;
}) {
  return (
    <>
      <input name="studentAccountId" type="hidden" value={studentAccountId} />
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    </>
  );
}

function PeriodValue({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-medium">{value}</dd>
    </div>
  );
}

function ActionFeedback({
  error,
}: {
  error:
    | 'backward'
    | 'completed'
    | 'inProgress'
    | 'invalid'
    | 'notFound'
    | 'providerUnavailable'
    | 'shortening'
    | 'stale'
    | 'unavailable'
    | null;
}) {
  const t = useTranslations('AccountControls');
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error !== null) alertRef.current?.focus();
  }, [error]);
  return error === null ? null : (
    <Alert ref={alertRef} tabIndex={-1} variant="destructive">
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

function SubmitButton({
  icon,
  label,
  loading,
  variant,
}: {
  icon?: 'calendar' | 'key' | 'search';
  label: string;
  loading: string;
  variant?: 'outline';
}) {
  const { pending } = useFormStatus();
  const Icon = icon === 'calendar' ? CalendarClockIcon : icon === 'key' ? KeyRoundIcon : SearchIcon;
  return (
    <Button disabled={pending} type="submit" variant={variant}>
      {pending ? (
        <Spinner aria-label={loading} data-icon="inline-start" />
      ) : icon === undefined ? null : (
        <Icon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? loading : label}
    </Button>
  );
}
