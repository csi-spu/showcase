'use client';

import { FileTextIcon, LayoutTemplateIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  createDraftField,
  INITIAL_FORM_ACTION_STATE,
  toFieldPayload,
  type CollectionFormActionState,
} from '@/app/collection-forms-state';
import type {
  InstructorCollectionForm,
  InstructorCollectionTemplate,
} from '@/lib/instructor-collection-forms-contract';

type FormsAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

export function FormsSection({
  createAction,
  createFromTemplateAction,
  forms,
  groupId,
  templates,
}: {
  createAction: FormsAction;
  createFromTemplateAction: FormsAction;
  forms: InstructorCollectionForm[];
  groupId: string;
  templates: InstructorCollectionTemplate[];
}) {
  const t = useTranslations('Forms');

  return (
    <section aria-labelledby="collection-forms-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" id="collection-forms-heading">
          {t('list.heading')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <CreateFormDialog action={createAction} />
          <CreateFromTemplateDialog
            action={createFromTemplateAction}
            templates={templates}
          />
        </div>
      </div>

      {forms.length === 0 ? (
        <EmptyState
          description={t('list.emptyDescription')}
          icon={FileTextIcon}
          title={t('list.empty')}
        />
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {forms.map((form) => (
            <li key={form.id}>
              <Link
                className="flex items-center justify-between gap-3 rounded-surface border border-input bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                href={`/groups/${groupId}/forms/${form.id}`}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{form.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {t('list.fieldCount', { count: form.fields.length })}
                  </span>
                </span>
                <StatusBadge tone={form.status === 'draft' ? 'muted' : 'information'}>
                  {t(`status.${form.status}`)}
                </StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Creates an empty Draft with one starter field the builder can then shape. */
function CreateFormDialog({ action }: { action: FormsAction }) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) toast.error(errorT(nextState.error));
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );
  /* A new Draft starts with one field so the builder opens on something editable. */
  const starterFields = JSON.stringify([
    toFieldPayload({ ...createDraftField('field-1'), label: t('list.starterFieldLabel') }),
  ]);

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" type="button">
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {t('list.create')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{t('list.createTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('list.createDescription')}</AlertDialogDescription>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="description" type="hidden" value="" />
          <input name="deadlineAt" type="hidden" value="" />
          <input name="fields" type="hidden" value={starterFields} />
          <Field>
            <FieldLabel htmlFor={titleId}>{t('builder.title')}</FieldLabel>
            <Input id={titleId} name="title" required />
          </Field>
          {state.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('builder.cancel')}</Button>} />
            <SubmitButton label={t('list.createConfirm')} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Creates a Draft from a Template.
 *
 * The description states plainly that only the structure is copied and that the
 * two drift apart afterwards, so nobody expects a live link.
 */
function CreateFromTemplateDialog({
  action,
  templates,
}: {
  action: FormsAction;
  templates: InstructorCollectionTemplate[];
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const baseId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) toast.error(errorT(nextState.error));
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button disabled={templates.length === 0} size="sm" type="button" variant="outline">
            <LayoutTemplateIcon aria-hidden="true" data-icon="inline-start" />
            {t('template.useAction')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{t('template.useTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('template.useDescription')}</AlertDialogDescription>
        <form action={formAction} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={`${baseId}-template`}>{t('template.pick')}</FieldLabel>
            <select
              className="h-11 w-full rounded-control border border-input bg-card px-3 text-base md:text-sm"
              id={`${baseId}-template`}
              name="templateId"
              required
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-title`}>{t('builder.title')}</FieldLabel>
            <Input id={`${baseId}-title`} name="title" required />
            <FieldDescription>{t('template.independentHint')}</FieldDescription>
          </Field>
          {state.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('builder.cancel')}</Button>} />
            <SubmitButton label={t('template.useConfirm')} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations('Forms');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : null}
      {pending ? t('builder.saving') : label}
    </Button>
  );
}
