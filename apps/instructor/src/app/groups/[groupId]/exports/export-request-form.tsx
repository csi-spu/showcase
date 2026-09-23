'use client';

import { FileSpreadsheetIcon, FileArchiveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  INITIAL_FORM_ACTION_STATE,
  type CollectionFormActionState,
} from '@/app/collection-forms-state';
import type { InstructorExportKind } from '@/lib/instructor-collection-forms-contract';

/* Mirrors the snapshot bound Core enforces, so the limit is visible before submitting. */
const MAX_EXPORT_FORMS = 30;

interface ExportableForm {
  id: string;
  title: string;
}

type CreateExportAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

/**
 * Requests an export of selected forms.
 *
 * The forms are chosen explicitly rather than defaulting to the whole group: an
 * Instructor exporting one form must not silently snapshot thirty. Nothing is
 * preselected for the same reason.
 */
export function ExportRequestForm({
  action,
  forms,
}: {
  action: CreateExportAction;
  forms: ExportableForm[];
}) {
  const t = useTranslations('Forms.exports');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const kindId = useId();
  const formsId = useId();
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>([]);
  const [kind, setKind] = useState<InstructorExportKind>('excel');
  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      setSelectedFormIds([]);
      toast.success(t('requested'));
      router.refresh();
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  const isOverLimit = selectedFormIds.length > MAX_EXPORT_FORMS;
  const canSubmit = selectedFormIds.length > 0 && !isOverLimit;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="kind" type="hidden" value={kind} />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground" id={kindId}>
          {t('kindLabel')}
        </legend>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              checked={kind === 'excel'}
              className="size-4 accent-primary"
              name="kindChoice"
              onChange={() => setKind('excel')}
              type="radio"
              value="excel"
            />
            <FileSpreadsheetIcon aria-hidden="true" className="size-4 shrink-0" />
            {t('kindExcel')}
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              checked={kind === 'zip'}
              className="size-4 accent-primary"
              name="kindChoice"
              onChange={() => setKind('zip')}
              type="radio"
              value="zip"
            />
            <FileArchiveIcon aria-hidden="true" className="size-4 shrink-0" />
            {t('kindZip')}
          </label>
        </div>
      </fieldset>

      <Field>
        <FieldLabel htmlFor={formsId}>{t('formsLabel')}</FieldLabel>
        <FieldDescription id={`${formsId}-hint`}>{t('formsHint')}</FieldDescription>
        <div
          aria-describedby={`${formsId}-hint`}
          className="flex flex-col gap-2"
          data-slot="checkbox-group"
          id={formsId}
          role="group"
        >
          {forms.map((form) => (
            <label className="flex items-center gap-2 text-sm text-foreground" key={form.id}>
              <input
                checked={selectedFormIds.includes(form.id)}
                className="size-4 rounded-sm accent-primary"
                name="formIds"
                onChange={(event) =>
                  setSelectedFormIds((current) =>
                    event.target.checked
                      ? [...current, form.id]
                      : current.filter((id) => id !== form.id),
                  )
                }
                type="checkbox"
                value={form.id}
              />
              {form.title}
            </label>
          ))}
        </div>
      </Field>

      <SubmitButton isEnabled={canSubmit} label={t('submit')} pendingLabel={t('submitting')} />
      {state.error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {errorT(state.error)}
        </p>
      )}
    </form>
  );
}

function SubmitButton({
  isEnabled,
  label,
  pendingLabel,
}: {
  isEnabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button className="w-fit" disabled={pending || !isEnabled} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
