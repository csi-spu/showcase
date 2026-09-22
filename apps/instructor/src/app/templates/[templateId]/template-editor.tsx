'use client';

import { EyeIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@showcase/ui/button';
import { Textarea } from '@showcase/ui/textarea';
import { toast } from '@showcase/ui/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  createDraftField,
  findDraftFieldError,
  INITIAL_FORM_ACTION_STATE,
  toDraftField,
  toFieldPayload,
  type CollectionFormActionState,
  type CollectionFormsErrorMessage,
  type DraftField,
} from '@/app/collection-forms-state';
import type { InstructorCollectionTemplate } from '@/lib/instructor-collection-forms-contract';
import { FieldEditor } from '@/app/groups/[groupId]/forms/field-editor';
import { FormPreview } from '@/app/groups/[groupId]/forms/form-preview';

type TemplateAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

/**
 * The Template structure editor.
 *
 * A Template carries structure only, so there is no deadline, no recipient, and
 * no open action here. Editing one never reaches the forms already created from
 * it: those were copied at creation time and stay independent.
 */
export function TemplateEditor({
  saveAction,
  template,
}: {
  saveAction: TemplateAction;
  template: InstructorCollectionTemplate;
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const baseId = useId();

  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [fields, setFields] = useState<DraftField[]>(() => template.fields.map(toDraftField));
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [clientError, setClientError] = useState<{
    fieldId: string;
    message: CollectionFormsErrorMessage;
  } | null>(null);
  /* Tracks unsaved structure so the Instructor is never unsure what is stored. */
  const [isDirty, setIsDirty] = useState(false);

  const serializedFields = useMemo(() => JSON.stringify(fields.map(toFieldPayload)), [fields]);

  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const invalid = findDraftFieldError(fields);
      if (invalid !== null) {
        /* Stop before the round trip and point at the field that needs attention. */
        setClientError(invalid);
        document.getElementById(`field-${invalid.fieldId}`)?.scrollIntoView({ block: 'center' });
        toast.error(errorT(invalid.message));
        return { ...previousState, error: invalid.message, fieldId: invalid.fieldId };
      }
      setClientError(null);
      const nextState = await saveAction(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      setIsDirty(false);
      toast.success(t('template.editSaved'));
      router.refresh();
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  function updateField(id: string, patch: Partial<DraftField>) {
    setIsDirty(true);
    setClientError((current) => (current?.fieldId === id ? null : current));
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  function removeField(id: string) {
    setIsDirty(true);
    setClientError((current) => (current?.fieldId === id ? null : current));
    setFields((current) => current.filter((field) => field.id !== id));
  }

  function moveField(id: string, direction: -1 | 1) {
    setIsDirty(true);
    setFields((current) => {
      const index = current.findIndex((field) => field.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved === undefined) return current;
      next.splice(target, 0, moved);
      return next;
    });
  }

  function addField() {
    setIsDirty(true);
    setFields((current) => [...current, createDraftField(crypto.randomUUID())]);
  }

  const nameId = `${baseId}-name`;
  const descriptionId = `${baseId}-description`;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input name="fields" type="hidden" value={serializedFields} />

      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor={nameId}>{t('template.nameLabel')}</FieldLabel>
          <Input
            id={nameId}
            name="name"
            onChange={(event) => {
              setIsDirty(true);
              setName(event.target.value);
            }}
            required
            value={name}
          />
          <FieldDescription>{t('template.nameHint')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={descriptionId}>{t('template.descriptionLabel')}</FieldLabel>
          <Textarea
            id={descriptionId}
            name="description"
            onChange={(event) => {
              setIsDirty(true);
              setDescription(event.target.value);
            }}
            rows={3}
            value={description}
          />
        </Field>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t('builder.fieldsHeading')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isDirty ? <StatusBadge tone="warning">{t('builder.unsaved')}</StatusBadge> : null}
            <Button
              aria-pressed={isPreviewing}
              onClick={() => setIsPreviewing((current) => !current)}
              size="sm"
              type="button"
              variant="outline"
            >
              <EyeIcon aria-hidden="true" data-icon="inline-start" />
              {isPreviewing ? t('builder.backToEdit') : t('builder.preview')}
            </Button>
          </div>
        </div>

        {isPreviewing ? (
          <FormPreview description={description} fields={fields} title={name} />
        ) : (
          <div className="flex flex-col gap-4">
            {fields.map((field, index) => (
              <FieldEditor
                errorMessage={clientError?.fieldId === field.id ? clientError.message : null}
                field={field}
                index={index}
                isFirst={index === 0}
                isLast={index === fields.length - 1}
                key={field.id}
                onChange={updateField}
                onMove={moveField}
                onRemove={removeField}
                totalCount={fields.length}
              />
            ))}
            <Button onClick={addField} type="button" variant="outline">
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              {t('builder.addField')}
            </Button>
          </div>
        )}
      </section>

      {state.error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{errorT(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const t = useTranslations('Forms');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <Spinner aria-hidden="true" />
      ) : (
        <SaveIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {t('template.editSave')}
    </Button>
  );
}
