'use client';

import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  CircleDotIcon,
  HashIcon,
  ListIcon,
  ListTodoIcon,
  PaperclipIcon,
  RefreshCwIcon,
  SendIcon,
  SquareCheckIcon,
  UserRoundIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@showcase/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BlurFade } from '@/components/ui/blur-fade';
import { BorderBeam } from '@/components/ui/border-beam';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import type { CollectionFieldType } from '@/lib/student-collection-forms-contract';
import {
  buildInitialAnswers,
  findSubmitBlockers,
  isValueField,
  type CollectionAnswers,
  type CollectionAnswerValue,
} from './collection-answers';
import { saveCollectionDraftAction, submitCollectionFormAction } from './collection-forms.actions';
import type { StudentFormsErrorMessage } from './collection-forms-errors';
import { FormFieldControl } from './form-field-control';
import { FormFileField } from './form-file-field';
import type {
  StudentCollectionObligation,
  StudentCollectionPrefill,
} from '@/lib/student-collection-forms-contract';

const AUTOSAVE_DELAY_MS = 1_500;

/* One icon per field type, so the kind of answer expected reads before the label does. */
const FIELD_TYPE_ICONS: Record<CollectionFieldType, LucideIcon> = {
  date: CalendarIcon,
  file_upload: PaperclipIcon,
  long_text: ListIcon,
  multiple_choice: SquareCheckIcon,
  number: HashIcon,
  short_text: ListTodoIcon,
  single_choice: CircleDotIcon,
};

type SaveState =
  | { kind: 'conflict' }
  | { kind: 'error'; message: StudentFormsErrorMessage }
  | { kind: 'idle' }
  | { kind: 'saved' }
  | { kind: 'saving' }
  | { kind: 'unsaved' };

/**
 * The Student's answer form.
 *
 * Answers live in client state and are autosaved to Core. A save is never a
 * submission; submitting is a separate, explicit action.
 *
 * Nothing is discarded on a failed save: the Student's own edits stay on screen
 * and a retry is offered, so a dropped connection cannot lose their work.
 */
export function CollectionForm({
  obligation,
  prefills,
}: {
  obligation: StudentCollectionObligation;
  prefills: StudentCollectionPrefill[];
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const baseId = useId();

  const { form, status } = obligation;
  /*
   * Core decides this, because a closed form or round is read-only at a
   * status that otherwise accepts writes. Deriving it from `status` alone
   * left the form editable until the submit came back refused.
   */
  const isReadOnly = !obligation.isWritable;
  /*
   * The status messages explain the states a Student reached themselves.
   * Closure is someone else's decision arriving at a status that would
   * otherwise be writable, so it has its own reason.
   */
  const readOnlyReason =
    status === 'not_submitted' || status === 'changes_required' ? 'closed' : status;

  const initial = useMemo(
    () => buildInitialAnswers(form.fields, obligation.draft?.answers ?? {}, prefills),
    [form.fields, obligation.draft?.answers, prefills],
  );

  const [answers, setAnswers] = useState<CollectionAnswers>(initial.answers);
  const [version, setVersion] = useState(obligation.draft?.version ?? 0);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [blockers, setBlockers] = useState<{ fieldId: string; reason: string }[]>([]);
  const [submitError, setSubmitError] = useState<StudentFormsErrorMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prefilledFieldIds, setPrefilledFieldIds] = useState(initial.prefilledFieldIds);

  /*
   * One key for this form's submissions. Reusing it across retries is what
   * makes a lost response safe: Core recognises the repeat instead of recording
   * a second submission. It is created once, lazily, so every render of the
   * same form keeps the same key.
   */
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  /* The server's answers when a save was refused, shown so the Student can choose. */
  const [conflict, setConflict] = useState<CollectionAnswers | null>(null);

  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [fieldId, files] of Object.entries(obligation.draft?.files ?? {})) {
      counts[fieldId] = files.length;
    }
    return counts;
  }, [obligation.draft?.files]);

  /*
   * Saves the given answers at the given version.
   *
   * Both are passed in rather than read from a ref so that what is sent is
   * exactly what the caller decided to send. Returns the version to continue
   * from, or null when the save did not go through.
   */
  const save = useCallback(
    async (nextAnswers: CollectionAnswers, atVersion: number): Promise<number | null> => {
      setSaveState({ kind: 'saving' });
      const result = await saveCollectionDraftAction(form.id, atVersion, nextAnswers);

      if (result.error === 'draftStale') {
        /*
         * Someone else saved first. Neither side is overwritten: the Student's
         * answers stay on screen, the server's are held so they can be compared
         * and adopted deliberately, and the version moves on so that a chosen
         * resolution can actually be saved.
         */
        if (result.version !== null) setVersion(result.version);
        setConflict(result.serverAnswers);
        setSaveState({ kind: 'conflict' });
        return null;
      }
      if (result.error !== null) {
        setSaveState({ kind: 'error', message: result.error });
        return null;
      }
      if (result.version !== null) setVersion(result.version);
      setSaveState({ kind: 'saved' });
      return result.version;
    },
    [form.id],
  );

  /*
   * Debounced autosave. Every edit restarts the timer, so typing is not chatty.
   * The timer closes over the answers and version of the render that scheduled
   * it, and any later edit replaces it, so the request always carries the
   * values it was scheduled for.
   */
  useEffect(() => {
    if (isReadOnly || saveState.kind !== 'unsaved') return;
    const timer = setTimeout(() => {
      void save(answers, version);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [answers, isReadOnly, save, saveState.kind, version]);

  function updateAnswer(fieldId: string, value: CollectionAnswerValue) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setSaveState({ kind: 'unsaved' });
    /* A fresh edit answers the conflict: this is the version the Student wants. */
    setConflict(null);
    setBlockers((current) => current.filter((blocker) => blocker.fieldId !== fieldId));
    /* Once the Student edits a filled-in value it is theirs, not the system's. */
    setPrefilledFieldIds((current) => current.filter((id) => id !== fieldId));
  }

  async function handleSubmit() {
    setSubmitError(null);
    const found = findSubmitBlockers(form.fields, answers, fileCounts);
    if (found.length > 0) {
      setBlockers(found);
      /*
       * Focus moves to the summary, it is not only scrolled to. Scrolling alone
       * leaves a keyboard or screen reader user where they were -- told that
       * something failed, but not taken to it -- and leaves the next Tab
       * continuing from the submit button rather than from the problem.
       * The summary renders in the same commit that sets the blockers, so the
       * move is queued until after that paint.
       */
      requestAnimationFrame(() => {
        document.getElementById(`${baseId}-summary`)?.focus();
      });
      return;
    }
    setBlockers([]);
    setIsSubmitting(true);
    const result = await submitCollectionFormAction(form.id, version, answers, idempotencyKey);
    setIsSubmitting(false);
    if (result.error !== null) {
      /*
       * A stale version here means another device saved while this form was
       * open. It is reported as a conflict rather than retried, so the Student
       * decides which answers are submitted.
       */
      if (result.error === 'draftStale') {
        setSaveState({ kind: 'conflict' });
        return;
      }
      setSubmitError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section aria-label={form.title} className="flex flex-col gap-4">
      {status === 'changes_required' && obligation.latestCheckingReason !== null ? (
        <Alert variant="warning">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>{t('changesRequiredTitle')}</AlertTitle>
          <AlertDescription>{obligation.latestCheckingReason}</AlertDescription>
        </Alert>
      ) : null}

      {/* History only exists once something was submitted, so the link appears with it. */}
      {obligation.latestSubmission !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-surface border border-border/80 bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t('lastSubmitted', {
              date: new Intl.DateTimeFormat('th-TH', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Bangkok',
              }).format(new Date(obligation.latestSubmission.submittedAt)),
            })}
          </p>
          <Link
            className="rounded-control text-sm font-medium text-accent-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            href={`/history/${obligation.form.id}`}
          >
            {t('history.openAction')}
          </Link>
        </div>
      ) : null}

      <BlurFade offset={8}>
        <div className="group relative flex items-start gap-3 overflow-hidden rounded-surface border border-border/80 bg-card p-4 sm:p-5">
          <BorderBeam
            className="opacity-0 transition-opacity group-focus-within:opacity-100"
            size={80}
          />
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-accent-foreground">
            <UserRoundIcon aria-hidden="true" className="size-4.5" />
          </span>
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor={`${baseId}-roster`}>{t('rosterName')}</FieldLabel>
            <Input
              id={`${baseId}-roster`}
              readOnly
              value={`${obligation.rosterName.firstNameTh} ${obligation.rosterName.lastNameTh}`}
            />
            <FieldDescription>{t('rosterNameHint')}</FieldDescription>
          </Field>
        </div>
      </BlurFade>

      {form.fields.map((field, index) => {
        const controlId = `${baseId}-${field.id}`;
        const blocker = blockers.find((entry) => entry.fieldId === field.id);
        const hintId = field.description ? `${controlId}-hint` : undefined;
        const FieldIcon = FIELD_TYPE_ICONS[field.type];
        return (
          <BlurFade delay={0.03 * (index + 1)} key={field.id} offset={8}>
            <div
              className="group relative flex items-start gap-3 overflow-hidden rounded-surface border border-border/80 bg-card p-4 sm:p-5"
              id={`field-${field.id}`}
            >
              <BorderBeam
                className="opacity-0 transition-opacity group-focus-within:opacity-100"
                size={80}
              />
              <span className="flex flex-col items-center gap-1.5">
                <StatusBadge className="rounded-md px-2" tone="primary">
                  {t('fieldNumber', { number: index + 1 })}
                </StatusBadge>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FieldIcon aria-hidden="true" className="size-4.5" />
                </span>
              </span>
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor={controlId}>
                  {field.label}
                  {field.required ? (
                    <>
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                      <span className="sr-only">{t('requiredLabel')}</span>
                    </>
                  ) : null}
                </FieldLabel>
                {field.description ? (
                  <FieldDescription className="whitespace-pre-line" id={hintId}>
                    {field.description}
                  </FieldDescription>
                ) : null}

                {isValueField(field.type) ? (
                  <FormFieldControl
                    controlId={controlId}
                    describedBy={hintId}
                    field={field}
                    isInvalid={blocker !== undefined}
                    isReadOnly={isReadOnly}
                    onChange={(value) => updateAnswer(field.id, value)}
                    value={answers[field.id] ?? ''}
                  />
                ) : (
                  <FormFileField
                    field={field}
                    files={obligation.draft?.files[field.id] ?? []}
                    formId={form.id}
                    isReadOnly={isReadOnly}
                    onChanged={() => router.refresh()}
                  />
                )}

                {prefilledFieldIds.includes(field.id) ? (
                  <StatusBadge tone="information">{t('prefilled')}</StatusBadge>
                ) : null}
                {blocker !== undefined ? (
                  <p className="text-sm font-medium text-destructive">
                    {t(`blocker.${blocker.reason}`)}
                  </p>
                ) : null}
              </Field>
            </div>
          </BlurFade>
        );
      })}

      {isReadOnly ? (
        <Alert>
          <AlertDescription>{t(`readOnly.${readOnlyReason}`)}</AlertDescription>
        </Alert>
      ) : (
        <>
          {blockers.length > 0 ? (
            <Alert
              className="scroll-mt-24 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              id={`${baseId}-summary`}
              /* Focusable only as a focus target, so it never joins the tab order. */
              tabIndex={-1}
              variant="destructive"
            >
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>{t('submitBlockedTitle')}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc ps-5">
                  {blockers.map((blocker) => (
                    <li key={blocker.fieldId}>
                      <a className="underline" href={`#field-${blocker.fieldId}`}>
                        {form.fields.find((field) => field.id === blocker.fieldId)?.label ??
                          blocker.fieldId}
                      </a>
                      {` — ${t(`blocker.${blocker.reason}`)}`}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <SaveStatus
            canAdoptServerAnswers={conflict !== null}
            onAdoptServerAnswers={() => {
              /*
               * The Student chose the other version. It replaces what is on
               * screen only because they asked for it, and is then saved so
               * both sides agree.
               */
              if (conflict === null) return;
              setAnswers(conflict);
              setPrefilledFieldIds([]);
              setConflict(null);
              void save(conflict, version);
            }}
            onRetry={() => void save(answers, version)}
            state={saveState}
          />

          {submitError !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(submitError)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={isSubmitting} onClick={() => void handleSubmit()} type="button">
              {isSubmitting ? <Spinner aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
            <Button
              disabled={saveState.kind === 'saving'}
              onClick={() => void save(answers, version)}
              type="button"
              variant="outline"
            >
              {t('saveDraft')}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t('submitHint')}</p>
        </>
      )}
    </section>
  );
}

/** States the save can be in, always stated in words rather than colour alone. */
function SaveStatus({
  canAdoptServerAnswers,
  onAdoptServerAnswers,
  onRetry,
  state,
}: {
  canAdoptServerAnswers: boolean;
  onAdoptServerAnswers: () => void;
  onRetry: () => void;
  state: SaveState;
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');

  if (state.kind === 'idle') return null;

  if (state.kind === 'conflict') {
    return (
      <Alert variant="warning">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>{t('save.conflictTitle')}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {t('save.conflictDescription')}
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              <RefreshCwIcon aria-hidden="true" />
              {t('save.keepMine')}
            </Button>
            {/* Offered only when the other version actually came back. */}
            {canAdoptServerAnswers ? (
              <Button onClick={onAdoptServerAnswers} size="sm" type="button" variant="outline">
                {t('save.useTheirs')}
              </Button>
            ) : null}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (state.kind === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>{t('save.failedTitle')}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {`${errorT(state.message)} ${t('save.failedKeepsWork')}`}
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            <RefreshCwIcon aria-hidden="true" />
            {t('save.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
      {state.kind === 'saving' ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
      {state.kind === 'saved' ? (
        <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
      ) : null}
      {t(`save.${state.kind}`)}
    </p>
  );
}
