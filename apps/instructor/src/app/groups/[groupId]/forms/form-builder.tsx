'use client';

import {
  FileTextIcon,
  ListChecksIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  UnlockIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { arrayMove } from '@dnd-kit/sortable';
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
  INITIAL_SAVE_FORM_ACTION_STATE,
  toDraftField,
  toFieldPayload,
  type CollectionFormActionState,
  type CollectionFormsErrorMessage,
  type DraftField,
  type SaveFormAction,
  type SaveFormActionState,
} from '@/app/collection-forms-state';
import type { InstructorCollectionForm } from '@/lib/instructor-collection-forms-contract';
import { FormPreview } from './form-preview';
import { SortableFieldList } from './sortable-field-list';

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
  saveAction: SaveFormAction;
  saveTemplateAction: BuilderAction;
}

/** The detail input a Core rejection points at, so focus can move to it. */
function toDetailsErrorTarget(error: CollectionFormsErrorMessage | null) {
  switch (error) {
    case 'formInvalid':
    case 'invalid':
      return 'title';
    case 'deadlineInvalid':
    case 'deadlineNotExtendable':
      return 'deadline';
    default:
      return null;
  }
}

/**
 * The form builder.
 *
 * Details and questions live in client state and are saved together, so one
 * save is one version check and nothing is ever half-stored. Adding,
 * reordering, or previewing a question costs nothing until then. Open forms
 * remain editable; submitted versions retain the field snapshot they were
 * answered against.
 */
export function FormBuilder({
  closeAction,
  form,
  openAction,
  reopenAction,
  reopenNewlyAssignedCount,
  saveAction,
  saveTemplateAction,
}: FormBuilderProps) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const deadlineId = `${baseId}-deadline`;
  const detailsErrorId = `${baseId}-details-error`;
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description);
  const [deadline, setDeadline] = useState(toDeadlineInput(form.deadlineAt));
  const [fields, setFields] = useState<DraftField[]>(() => form.fields.map(toDraftField));
  const [activeFieldId, setActiveFieldId] = useState<string | null>(form.fields[0]?.id ?? null);
  const [clientError, setClientError] = useState<{
    fieldId: string;
    message: CollectionFormsErrorMessage;
  } | null>(null);
  /* One flag for the whole form, so the Instructor is never unsure what is stored. */
  const [isDirty, setIsDirty] = useState(false);
  /*
   * Counts edits, so a save that succeeds only clears the flag when nothing was
   * edited while it was in flight; a later edit is still unsaved.
   */
  const editCount = useRef(0);

  function markDirty() {
    editCount.current += 1;
    setIsDirty(true);
  }

  const serializedFields = useMemo(() => JSON.stringify(fields.map(toFieldPayload)), [fields]);

  const [saveState, saveFormAction] = useActionState(
    async (previousState: SaveFormActionState, formData: FormData) => {
      const invalid = findDraftFieldError(fields);
      if (invalid !== null) {
        /* Stop before the round trip and point at the field that needs attention. */
        setClientError(invalid);
        setActiveFieldId(invalid.fieldId);
        /*
         * Focus moves to the offending field, it is not only scrolled to. A
         * toast plus a scroll leaves a keyboard user where they were and the
         * announcement unanchored; moving focus puts them at the problem and
         * lets the next Tab continue from it. The card becomes focusable in the
         * same commit that sets the error, so this is queued until after paint.
         */
        requestAnimationFrame(() => {
          document.getElementById(`field-${invalid.fieldId}`)?.focus();
        });
        toast.error(errorT(invalid.message));
        return { ...previousState, error: invalid.message, fieldId: invalid.fieldId };
      }
      setClientError(null);
      const savedEditCount = editCount.current;
      const nextState = await saveAction(previousState, formData);
      if (nextState.error !== null) {
        /*
         * Edits stay on screen whatever the reason. A stale save says to reload
         * rather than reloading, so nothing typed is thrown away unasked.
         */
        toast.error(errorT(nextState.error));
        const target = toDetailsErrorTarget(nextState.error);
        if (target !== null) {
          requestAnimationFrame(() => {
            document.getElementById(target === 'title' ? titleId : deadlineId)?.focus();
          });
        }
        return { ...nextState, version: previousState.version };
      }
      if (editCount.current === savedEditCount) setIsDirty(false);
      setActiveFieldId(null);
      toast.success(t('builder.saved'));
      router.refresh();
      return nextState;
    },
    INITIAL_SAVE_FORM_ACTION_STATE,
  );

  /*
   * The page's version catches opening, closing, and edits made elsewhere; the
   * last save's version covers a second save before the refresh arrives.
   */
  const expectedVersion = Math.max(form.version, saveState.version ?? 0);

  function updateField(id: string, patch: Partial<DraftField>) {
    const currentField = fields.find((field) => field.id === id);
    const nextId =
      patch.type !== undefined && currentField !== undefined && patch.type !== currentField.type
        ? crypto.randomUUID()
        : id;

    markDirty();
    setClientError((current) => (current?.fieldId === id ? null : current));
    setFields((current) =>
      current.map((field) => {
        if (field.id !== id) return field;
        return { ...field, ...patch, id: nextId };
      }),
    );
    if (nextId !== id) setActiveFieldId(nextId);
  }

  function addField() {
    const field = createDraftField(crypto.randomUUID());
    markDirty();
    setFields((current) => [...current, field]);
    setActiveFieldId(field.id);
  }

  function removeField(id: string) {
    markDirty();
    setClientError((current) => (current?.fieldId === id ? null : current));
    setFields((current) => current.filter((field) => field.id !== id));
    setActiveFieldId((current) => (current === id ? null : current));
  }

  function reorderField(activeId: string, overId: string) {
    markDirty();
    setFields((current) =>
      arrayMove(
        current,
        current.findIndex((field) => field.id === activeId),
        current.findIndex((field) => field.id === overId),
      ),
    );
  }

  const saveError = clientError?.message ?? saveState.error;
  const detailsErrorTarget = clientError === null ? toDetailsErrorTarget(saveState.error) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge icon={PencilIcon} tone={form.status === 'draft' ? 'muted' : 'information'}>
          {t(`status.${form.status}`)}
        </StatusBadge>
        <div className="flex flex-wrap items-center gap-2">
          <SaveAsTemplateDialog action={saveTemplateAction} defaultName={form.title} />
          {form.status === 'draft' ? (
            <OpenFormDialog
              action={openAction}
              description={description}
              fields={fields}
              fieldCount={fields.length}
              hasUnsavedChanges={isDirty}
              title={title}
            />
          ) : null}
          {form.status === 'open' ? <CloseFormDialog action={closeAction} /> : null}
          {form.status === 'closed' ? (
            <ReopenFormDialog action={reopenAction} newlyAssignedCount={reopenNewlyAssignedCount} />
          ) : null}
        </div>
      </div>

      {form.status !== 'draft' ? (
        <Alert variant="information">
          <PencilIcon aria-hidden="true" />
          <AlertTitle>{t('builder.liveEditingTitle')}</AlertTitle>
          <AlertDescription>{t('builder.liveEditingDescription')}</AlertDescription>
        </Alert>
      ) : null}

      <form action={saveFormAction} className="flex flex-col gap-6">
        <input name="expectedVersion" type="hidden" value={expectedVersion} />
        <input name="fields" type="hidden" value={serializedFields} />

        <section
          aria-labelledby={`${baseId}-details`}
          className="overflow-hidden rounded-surface border border-border/80 bg-card"
        >
          <div className="flex items-start gap-3 border-b border-border/70 bg-muted/25 px-4 py-4 sm:px-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
              <FileTextIcon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-semibold text-foreground" id={`${baseId}-details`}>
                {t('builder.detailsHeading')}
              </h2>
              <span className="text-sm text-muted-foreground">
                {t('builder.detailsDescription')}
              </span>
            </span>
          </div>
          <div className="grid gap-5 p-4 sm:p-5">
            <Field>
              <FieldLabel htmlFor={titleId}>{t('builder.title')}</FieldLabel>
              <Input
                aria-describedby={detailsErrorTarget === 'title' ? detailsErrorId : undefined}
                aria-invalid={detailsErrorTarget === 'title'}
                id={titleId}
                name="title"
                onChange={(event) => {
                  setTitle(event.target.value);
                  markDirty();
                }}
                required
                value={title}
              />
              {detailsErrorTarget === 'title' && saveState.error !== null ? (
                <p className="text-sm font-medium text-destructive" id={detailsErrorId}>
                  {errorT(saveState.error)}
                </p>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${baseId}-description`}>{t('builder.description')}</FieldLabel>
              <Textarea
                className="min-h-24 resize-y"
                id={`${baseId}-description`}
                name="description"
                onChange={(event) => {
                  setDescription(event.target.value);
                  markDirty();
                }}
                value={description}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={deadlineId}>{t('builder.deadline')}</FieldLabel>
              <Input
                aria-describedby={
                  detailsErrorTarget === 'deadline'
                    ? `${detailsErrorId} ${baseId}-deadline-hint`
                    : `${baseId}-deadline-hint`
                }
                aria-invalid={detailsErrorTarget === 'deadline'}
                id={deadlineId}
                name="deadlineAt"
                onChange={(event) => {
                  setDeadline(event.target.value);
                  markDirty();
                }}
                type="datetime-local"
                value={deadline}
              />
              {detailsErrorTarget === 'deadline' && saveState.error !== null ? (
                <p className="text-sm font-medium text-destructive" id={detailsErrorId}>
                  {errorT(saveState.error)}
                </p>
              ) : null}
              <FieldDescription id={`${baseId}-deadline-hint`}>
                {t('builder.deadlineHint')}
              </FieldDescription>
            </Field>
          </div>
        </section>

        <section
          aria-labelledby={`${baseId}-structure`}
          className="overflow-hidden rounded-surface border border-border/80 bg-card"
        >
          <div className="flex items-start gap-3 border-b border-border/70 bg-muted/25 px-4 py-4 sm:px-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
              <ListChecksIcon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-semibold text-foreground" id={`${baseId}-structure`}>
                {t('builder.fieldsHeading')}
              </h2>
              <span className="text-sm text-muted-foreground">
                {t('builder.fieldsDescription')}
              </span>
              {fields.length > 1 ? (
                <span className="text-sm text-muted-foreground">{t('builder.reorderHint')}</span>
              ) : null}
            </span>
          </div>

          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <SortableFieldList
              activeFieldId={activeFieldId}
              clientError={clientError}
              fields={fields}
              onChange={updateField}
              onRemove={removeField}
              onReorder={reorderField}
              onToggle={(id) => setActiveFieldId((current) => (current === id ? null : id))}
            />

            {fields.length === 0 ? (
              <p className="rounded-surface border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
                {t('builder.noFields')}
              </p>
            ) : null}

            <Button
              className="w-full border-dashed"
              onClick={addField}
              type="button"
              variant="outline"
            >
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              {t('builder.addField')}
            </Button>
          </div>
        </section>

        {/*
         * One save for the whole form, kept in reach while scrolling a long list
         * of questions. `data-sticky-save-bar` lets the page keep focused
         * controls from scrolling underneath it.
         */}
        <div
          className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-surface border border-border/80 bg-card/95 p-3 shadow-[0_0.75rem_2rem_-1.5rem_rgba(22,22,22,0.35)] supports-backdrop-filter:backdrop-blur-xs sm:flex-row sm:items-center sm:justify-end"
          data-sticky-save-bar
        >
          {saveError !== null && detailsErrorTarget === null ? (
            <Alert className="sm:mr-auto" variant="destructive">
              <AlertDescription>{errorT(saveError)}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex items-center justify-end gap-3">
            {isDirty ? <StatusBadge tone="warning">{t('builder.unsaved')}</StatusBadge> : null}
            <SubmitButton icon label={t('builder.save')} />
          </div>
        </div>
      </form>
    </div>
  );
}

/** Confirms opening and explains how later edits preserve submitted responses. */
function OpenFormDialog({
  action,
  description,
  fields,
  fieldCount,
  hasUnsavedChanges,
  title,
}: {
  action: OpenAction;
  description: string;
  fields: DraftField[];
  fieldCount: number;
  hasUnsavedChanges: boolean;
  title: string;
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
          <Button disabled={fieldCount === 0} type="button">
            <LockIcon aria-hidden="true" data-icon="inline-start" />
            {t('builder.open')}
          </Button>
        }
      />
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <AlertDialogTitle>{t('builder.openConfirmTitle')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('builder.openConfirmDescription', { count: fieldCount })}
        </AlertDialogDescription>
        <div className="flex flex-col gap-3 border-y border-border/70 py-4">
          <div>
            <h3 className="font-semibold text-foreground">{t('builder.finalPreviewHeading')}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('builder.finalPreviewDescription')}
            </p>
          </div>
          <FormPreview description={description} fields={fields} title={title} />
        </div>
        {hasUnsavedChanges ? (
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
            <SubmitButton disabled={hasUnsavedChanges} label={t('builder.openConfirm')} />
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

function SubmitButton({
  disabled = false,
  icon = false,
  label,
}: {
  disabled?: boolean;
  icon?: boolean;
  label: string;
}) {
  const t = useTranslations('Forms');
  const { pending } = useFormStatus();
  return (
    <Button disabled={disabled || pending} type="submit">
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
