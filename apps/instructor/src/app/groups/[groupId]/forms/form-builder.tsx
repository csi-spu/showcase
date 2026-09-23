'use client';

import { EyeIcon, LockIcon, PencilIcon, PlusIcon, SaveIcon, UnlockIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@showcase/ui/button';
import { Textarea } from '@showcase/ui/textarea';
import { toast } from '@showcase/ui/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import type { InstructorCollectionForm } from '@/lib/instructor-collection-forms-contract';
import { FieldEditor } from './field-editor';
import { FormPreview } from './form-preview';

type BuilderAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

/** Opening takes no input: the confirmation dialog is the whole interaction. */
type OpenAction = () => Promise<CollectionFormActionState>;

interface FormBuilderProps {
  closeAction: BuilderAction;
  form: InstructorCollectionForm;
  openAction: OpenAction;
  /**
   * How many obligations reopening would create, read on the server so the
   * confirmation states the real cost rather than a guess.
   */
  reopenNewlyAssignedCount: number | null;
  reopenAction: BuilderAction;
  saveMetadataAction: BuilderAction;
  saveStructureAction: BuilderAction;
  saveTemplateAction: BuilderAction;
}

/**
 * The Draft builder.
 *
 * Structure lives in client state and is posted once per save, so adding,
 * reordering, or previewing a field costs nothing. Once the form is open the
 * structure is locked for good and only the metadata form stays editable.
 */
export function FormBuilder({
  closeAction,
  form,
  openAction,
  reopenAction,
  reopenNewlyAssignedCount,
  saveMetadataAction,
  saveStructureAction,
  saveTemplateAction,
}: FormBuilderProps) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const baseId = useId();
  const isLocked = form.status !== 'draft';

  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description);
  const [deadline, setDeadline] = useState(toDeadlineInput(form.deadlineAt));
  const [fields, setFields] = useState<DraftField[]>(() => form.fields.map(toDraftField));
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [clientError, setClientError] = useState<{
    fieldId: string;
    message: CollectionFormsErrorMessage;
  } | null>(null);
  /* Tracks unsaved structure so the Instructor is never unsure what is stored. */
  const [isDirty, setIsDirty] = useState(false);

  const serializedFields = useMemo(() => JSON.stringify(fields.map(toFieldPayload)), [fields]);

  const [structureState, structureFormAction] = useActionState(
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
      const nextState = await saveStructureAction(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      setIsDirty(false);
      toast.success(t('builder.saved'));
      router.refresh();
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  const [metadataState, metadataFormAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await saveMetadataAction(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      toast.success(t('builder.metadataSaved'));
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

  function addField() {
    setIsDirty(true);
    setFields((current) => [...current, createDraftField(crypto.randomUUID())]);
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

  const structureError = clientError?.message ?? structureState.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge
          icon={isLocked ? LockIcon : PencilIcon}
          tone={isLocked ? 'information' : 'muted'}
        >
          {t(`status.${form.status}`)}
        </StatusBadge>
        <div className="flex items-center gap-2">
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
          {form.status === 'open' ? <CloseFormDialog action={closeAction} /> : null}
          {form.status === 'closed' ? (
            <ReopenFormDialog action={reopenAction} newlyAssignedCount={reopenNewlyAssignedCount} />
          ) : null}
          <SaveAsTemplateDialog action={saveTemplateAction} defaultName={form.title} />
        </div>
      </div>

      {isLocked ? (
        <Alert variant="information">
          <LockIcon aria-hidden="true" />
          <AlertTitle>{t('builder.lockedTitle')}</AlertTitle>
          <AlertDescription>{t('builder.lockedDescription')}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        Metadata stays editable after opening, so it is its own form and its own
        save. Structure below is Draft-only.
      */}
      <form action={metadataFormAction} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('builder.detailsHeading')}</h2>
        <Field>
          <FieldLabel htmlFor={`${baseId}-title`}>{t('builder.title')}</FieldLabel>
          <Input
            id={`${baseId}-title`}
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${baseId}-description`}>{t('builder.description')}</FieldLabel>
          <Textarea
            id={`${baseId}-description`}
            name="description"
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${baseId}-deadline`}>{t('builder.deadline')}</FieldLabel>
          <Input
            aria-describedby={`${baseId}-deadline-hint`}
            id={`${baseId}-deadline`}
            name="deadlineAt"
            onChange={(event) => setDeadline(event.target.value)}
            type="datetime-local"
            value={deadline}
          />
          <FieldDescription id={`${baseId}-deadline-hint`}>
            {t('builder.deadlineHint')}
          </FieldDescription>
        </Field>
        {metadataState.error !== null ? (
          <Alert variant="destructive">
            <AlertDescription>{errorT(metadataState.error)}</AlertDescription>
          </Alert>
        ) : null}
        <div>
          <SubmitButton label={t('builder.saveDetails')} />
        </div>
      </form>

      <section aria-labelledby={`${baseId}-structure`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold" id={`${baseId}-structure`}>
            {t('builder.fieldsHeading')}
          </h2>
          {isDirty && !isLocked ? (
            <StatusBadge tone="warning">{t('builder.unsaved')}</StatusBadge>
          ) : null}
        </div>

        {isPreviewing ? (
          <FormPreview description={description} fields={fields} title={title} />
        ) : isLocked ? (
          <FormPreview description={description} fields={fields} title={title} />
        ) : (
          <form action={structureFormAction} className="flex flex-col gap-4">
            <input name="title" type="hidden" value={title} />
            <input name="description" type="hidden" value={description} />
            <input name="deadlineAt" type="hidden" value={deadline} />
            <input name="fields" type="hidden" value={serializedFields} />

            <ul className="flex list-none flex-col gap-4 p-0">
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
            </ul>

            {fields.length === 0 ? (
              <p className="rounded-surface border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
                {t('builder.noFields')}
              </p>
            ) : null}

            <div>
              <Button onClick={addField} type="button" variant="outline">
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                {t('builder.addField')}
              </Button>
            </div>

            {structureError !== null ? (
              <Alert variant="destructive">
                <AlertDescription>{errorT(structureError)}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton icon label={t('builder.saveStructure')} />
              <OpenFormDialog action={openAction} fieldCount={fields.length} isDirty={isDirty} />
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

/** Confirms opening, spelling out that the structure can never change afterwards. */
function OpenFormDialog({
  action,
  fieldCount,
  isDirty,
}: {
  action: OpenAction;
  fieldCount: number;
  isDirty: boolean;
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(async (): Promise<CollectionFormActionState> => {
    const nextState = await action();
    if (nextState.error !== null) {
      toast.error(errorT(nextState.error));
      return nextState;
    }
    setIsOpen(false);
    toast.success(t('builder.openedSuccess'));
    router.refresh();
    return nextState;
  }, INITIAL_FORM_ACTION_STATE);

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button disabled={fieldCount === 0} type="button" variant="secondary">
            <LockIcon aria-hidden="true" data-icon="inline-start" />
            {t('builder.open')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{t('builder.openConfirmTitle')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('builder.openConfirmDescription', { count: fieldCount })}
        </AlertDialogDescription>
        {isDirty ? (
          <Alert variant="warning">
            <AlertDescription>{t('builder.openConfirmUnsaved')}</AlertDescription>
          </Alert>
        ) : null}
        {state.error !== null ? (
          <Alert variant="destructive">
            <AlertDescription>{errorT(state.error)}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline">{t('builder.cancel')}</Button>} />
          <form action={formAction}>
            <SubmitButton label={t('builder.openConfirm')} />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Confirms closing an open form.
 *
 * The description is explicit that this ends first submissions only, because
 * the obvious reading -- that closing freezes everything -- is wrong and would
 * lead an Instructor to close a form when they meant to close the round.
 */
function CloseFormDialog({ action }: { action: BuilderAction }) {
  const t = useTranslations('Forms');
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
      toast.success(t('builder.closedSuccess'));
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
            <LockIcon aria-hidden="true" data-icon="inline-start" />
            {t('builder.close')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{t('builder.closeConfirmTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('builder.closeConfirmDescription')}</AlertDialogDescription>
        <form action={formAction} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={reasonId}>{t('builder.lifecycleReason')}</FieldLabel>
            <Textarea id={reasonId} name="reason" required />
            <FieldDescription>{t('builder.lifecycleReasonHint')}</FieldDescription>
          </Field>
          {state.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('builder.cancel')}</Button>} />
            <SubmitButton label={t('builder.closeConfirm')} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Confirms reopening a closed form.
 *
 * Shows how many Students would newly owe this form, so reopening to collect a
 * few stragglers is not confused with asking everyone to submit again.
 */
function ReopenFormDialog({
  action,
  newlyAssignedCount,
}: {
  action: BuilderAction;
  newlyAssignedCount: number | null;
}) {
  const t = useTranslations('Forms');
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
      toast.success(t('builder.reopenedSuccess'));
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
            <UnlockIcon aria-hidden="true" data-icon="inline-start" />
            {t('builder.reopen')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{t('builder.reopenConfirmTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('builder.reopenConfirmDescription')}</AlertDialogDescription>
        {newlyAssignedCount === null ? null : (
          <Alert variant="information">
            <AlertDescription>
              {newlyAssignedCount === 0
                ? t('builder.reopenNoneAssigned')
                : t('builder.reopenNewlyAssigned', { count: newlyAssignedCount })}
            </AlertDescription>
          </Alert>
        )}
        <form action={formAction} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={reasonId}>{t('builder.lifecycleReason')}</FieldLabel>
            <Textarea id={reasonId} name="reason" required />
            <FieldDescription>{t('builder.lifecycleReasonHint')}</FieldDescription>
          </Field>
          {state.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('builder.cancel')}</Button>} />
            <SubmitButton label={t('builder.reopenConfirm')} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Saves this form's structure as a reusable Template. */
function SaveAsTemplateDialog({
  action,
  defaultName,
}: {
  action: BuilderAction;
  defaultName: string;
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const nameId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      setIsOpen(false);
      toast.success(t('template.saved'));
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <SaveIcon aria-hidden="true" data-icon="inline-start" />
            {t('template.saveAction')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{t('template.saveTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('template.saveDescription')}</AlertDialogDescription>
        <form action={formAction} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={nameId}>{t('template.name')}</FieldLabel>
            <Input defaultValue={defaultName} id={nameId} name="name" required />
          </Field>
          {state.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('builder.cancel')}</Button>} />
            <SubmitButton label={t('template.saveConfirm')} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SubmitButton({ icon = false, label }: { icon?: boolean; label: string }) {
  const t = useTranslations('Forms');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : null}
      {icon && !pending ? <SaveIcon aria-hidden="true" data-icon="inline-start" /> : null}
      {pending ? t('builder.saving') : label}
    </Button>
  );
}

/*
 * Core stores UTC. `datetime-local` has no zone, so the value is shown as
 * Asia/Bangkok wall-clock time and converted back on save.
 */
function toDeadlineInput(deadlineAt: string | null): string {
  if (deadlineAt === null) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(deadlineAt));
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}T${lookup('hour')}:${lookup('minute')}`;
}
