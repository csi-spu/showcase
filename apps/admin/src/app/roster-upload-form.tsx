'use client';

import { Button } from '@showcase/ui/button';
import { UploadIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { RosterUploadAction } from './roster-upload-state';
import { INITIAL_ROSTER_UPLOAD_STATE } from './roster-upload-state';

export function RosterUploadForm({ action }: { action: RosterUploadAction }) {
  const t = useTranslations('Roster');
  const [state, formAction] = useActionState(action, INITIAL_ROSTER_UPLOAD_STATE);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error !== null) errorRef.current?.focus();
  }, [state.error]);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FieldSet aria-label={t('form.groupLabel')}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="entry-year">{t('form.entryYear')}</FieldLabel>
            <Input
              id="entry-year"
              inputMode="numeric"
              max={2700}
              min={2400}
              name="entryYear"
              placeholder="2569"
              required
              type="number"
            />
            <FieldDescription>{t('form.entryYearHelp')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="roster-file">{t('form.file')}</FieldLabel>
            <Input accept=".csv,text/csv" id="roster-file" name="rosterFile" required type="file" />
            <FieldDescription>{t('form.fileHelp')}</FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>
      {state.error === null ? null : (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <UploadButton />
    </form>
  );
}

function UploadButton() {
  const t = useTranslations('Roster');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="lg" type="submit">
      {pending ? (
        <Spinner aria-label={t('form.uploading')} data-icon="inline-start" />
      ) : (
        <UploadIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? t('form.uploading') : t('form.submit')}
    </Button>
  );
}
