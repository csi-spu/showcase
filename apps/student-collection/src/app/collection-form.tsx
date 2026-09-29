'use client';

import { AlertCircleIcon, CheckIcon, RefreshCwIcon, SendIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@showcase/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BlurFade } from '@/components/ui/blur-fade';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  buildInitialAnswers,
  findSubmitBlockers,
  isValueField,
  type CollectionAnswers,
  type CollectionAnswerValue,
} from './collection-answers';
import {
  saveCollectionDraftAction,
  submitCollectionFormAction,
  type SaveDraftResult,
  type SubmitResult,
} from './collection-forms.actions';
import type { StudentFormsErrorMessage } from './collection-forms-errors';
import { FormFieldControl } from './form-field-control';
import { FormFileField } from './form-file-field';
import { SubmissionConfirmation } from './submission-confirmation';
import type {
  StudentCollectionObligation,
  StudentCollectionPrefill,
} from '@/lib/student-collection-forms-contract';

const AUTOSAVE_DELAY_MS = 1_500;

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
 *
 * Draft writes go out one at a time. Submit waits for a write in flight,
 * replaces the pending autosave, and after it succeeds nothing more is written,
 * so the Student's own autosave can never be refused behind their submission.
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
  const statusT = useTranslations('Forms.status');
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
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [blockers, setBlockers] = useState<{ fieldId: string; reason: string }[]>([]);
  const [submitError, setSubmitError] = useState<StudentFormsErrorMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [busyFileFieldIds, setBusyFileFieldIds] = useState<string[]>([]);
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
  /*
   * Core no longer has this form for the Student, usually because an
   * Instructor deleted it. It stays set: no later edit can be saved, so the
   * page stops writing and stops offering retries.
   */
  const [isFormGone, setIsFormGone] = useState(false);

  /*
   * What a draft write reads when it starts rather than when it was scheduled:
   * the answers on screen now, and the version Core accepted last, which an
   * earlier write may have moved on in the meantime.
   */
  const answersRef = useRef(answers);
  const versionRef = useRef(obligation.draft?.version ?? 0);
  /* The write in flight, if any. The next write waits for it. */
  const inFlightRef = useRef<Promise<number | null> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  /* The answers the last submit was sent for, saved at the version Core accepted. */
  const submittedAnswersRef = useRef<CollectionAnswers | null>(null);

  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [fieldId, files] of Object.entries(obligation.draft?.files ?? {})) {
      counts[fieldId] = files.length;
    }
    return counts;
  }, [obligation.draft?.files]);

  /*
   * Writes the given answers at the version Core accepted last. Returns the
   * new version, or null when the write did not go through.
   */
  const writeDraft = useCallback(
    async (nextAnswers: CollectionAnswers): Promise<number | null> => {
      setSaveState({ kind: 'saving' });
      let result: SaveDraftResult;
      try {
        result = await saveCollectionDraftAction(form.id, versionRef.current, nextAnswers);
      } catch {
        /* The response never arrived. The answers stay on screen with a retry. */
        result = { error: 'unavailable', fieldId: null, serverAnswers: null, version: null };
      }

      if (result.error === 'draftStale') {
        /*
         * Someone else saved first. Neither side is overwritten: the Student's
         * answers stay on screen, the server's are held so they can be compared
         * and adopted deliberately, and the version moves on so that a chosen
         * resolution can actually be saved.
         */
        if (result.version !== null) versionRef.current = result.version;
        setConflict(result.serverAnswers);
        setSaveState({ kind: 'conflict' });
        return null;
      }
      if (result.error !== null) {
        if (result.error === 'formNotFound') setIsFormGone(true);
        setSaveState({ kind: 'error', message: result.error });
        return null;
      }
      if (result.version !== null) versionRef.current = result.version;
      /* An edit made while this write was out is still unsaved; its autosave follows. */
      setSaveState({ kind: answersRef.current === nextAnswers ? 'saved' : 'unsaved' });
      return result.version;
    },
    [form.id],
  );

  /*
   * Saves the given answers once any write in flight has landed, so at most
   * one write for this form is ever outstanding.
   *
   * A write queued behind one that failed is dropped: that failure is on
   * screen with its retry, and writing past a conflict would overwrite the
   * other device's answers without the Student choosing to.
   */
  const save = useCallback(
    (nextAnswers: CollectionAnswers): Promise<number | null> => {
      const previous = inFlightRef.current;
      const write =
        previous === null
          ? writeDraft(nextAnswers)
          : previous.then((version) => (version === null ? null : writeDraft(nextAnswers)));
      inFlightRef.current = write;
      void write.then(() => {
        if (inFlightRef.current === write) inFlightRef.current = null;
      });
      return write;
    },
    [writeDraft],
  );

  /*
   * Debounced autosave. Every edit restarts the timer, so typing is not chatty.
   * It stops for good once a submit starts: the submit writes the answers
   * itself, and a write behind an accepted submission would only be refused.
   */
  useEffect(() => {
    if (isFormGone || isReadOnly || isSubmitting || saveState.kind !== 'unsaved') return;
    const timer = setTimeout(() => {
      void save(answers);
    }, AUTOSAVE_DELAY_MS);
    autosaveTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [answers, isFormGone, isReadOnly, isSubmitting, save, saveState.kind]);

  const handleFileBusyChange = useCallback((fieldId: string, isBusy: boolean) => {
    setBusyFileFieldIds((current) => {
      if (current.includes(fieldId) === isBusy) return current;
      return isBusy ? [...current, fieldId] : current.filter((id) => id !== fieldId);
    });
  }, []);

  function updateAnswer(fieldId: string, value: CollectionAnswerValue) {
    const next = { ...answersRef.current, [fieldId]: value };
    answersRef.current = next;
    setAnswers(next);
    setSaveState({ kind: 'unsaved' });
    /* A fresh edit answers the conflict: this is the version the Student wants. */
    setConflict(null);
    setBlockers((current) => current.filter((blocker) => blocker.fieldId !== fieldId));
    /* Once the Student edits a filled-in value it is theirs, not the system's. */
    setPrefilledFieldIds((current) => current.filter((id) => id !== fieldId));
  }

  async function handleSubmit() {
    setSubmitError(null);
    /*
     * Exactly the answers on screen now. File counts are settled: submit is
     * disabled while any upload or its refresh is still pending.
     */
    const submitted = answersRef.current;
    const found = findSubmitBlockers(form.fields, submitted, fileCounts);
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
    /* The submit's own save replaces the pending autosave. */
    clearTimeout(autosaveTimerRef.current);

    /*
     * The save waits for any write in flight and continues from the version it
     * returned. A stale version means another device saved while this form was
     * open; that is the conflict flow, so the Student decides what is sent.
     *
     * A retry of a submit whose response was lost skips the save: Core may
     * already hold the submission and would refuse the write, and the same key
     * returns that submission rather than recording another.
     */
    if (submittedAnswersRef.current !== submitted) {
      if ((await save(submitted)) === null) {
        setIsSubmitting(false);
        return;
      }
      submittedAnswersRef.current = submitted;
    }

    let result: SubmitResult;
    try {
      result = await submitCollectionFormAction(form.id, idempotencyKey);
    } catch {
      result = { blockedFieldId: null, error: 'unavailable', submissionId: null };
    }
    if (result.error !== null) {
      /* A definite refusal was no lost response, so the next attempt saves first. */
      if (result.error !== 'unavailable') submittedAnswersRef.current = null;
      if (result.error === 'formNotFound') setIsFormGone(true);
      setIsSubmitting(false);
      setSubmitError(result.error);
      return;
    }
    /* The submit stays in progress until the refresh brings Core's record of it. */
    setSubmissionId(result.submissionId);
    router.refresh();
  }

  /*
   * Core's record of the submit just made. The confirmation waits for it, so
   * the time shown is Core's, and it exists only on this page: a later visit
   * starts without a submission id and shows the ordinary read-only view.
   */
  const confirmedSubmission =
    submissionId !== null && obligation.latestSubmission?.id === submissionId
      ? obligation.latestSubmission
      : null;
  const isWaitingForFiles = busyFileFieldIds.length > 0;
  let submitLabel = t('submit');
  if (isSubmitting) submitLabel = t('submitting');
  else if (isWaitingForFiles) submitLabel = t('submitWaitingForFiles');

  function renderQuestions(areQuestionsReadOnly: boolean) {
    return form.fields.map((field, index) => {
      const controlId = `${baseId}-${field.id}`;
      const blocker = blockers.find((entry) => entry.fieldId === field.id);
      const hintId = field.description ? `${controlId}-hint` : undefined;
      return (
        <BlurFade delay={0.03 * (index + 1)} key={field.id} offset={8}>
          <div
            className="form-question rounded-surface border border-border/80 bg-card p-5 shadow-xs transition-[box-shadow,border-color] duration-200 hover:shadow-md data-[invalid=true]:border-destructive/50 sm:p-6"
            data-invalid={blocker !== undefined}
            id={`field-${field.id}`}
          >
            <Field className="gap-3">
              <FieldLabel className="gap-1 text-base font-medium" htmlFor={controlId}>
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
                  isReadOnly={areQuestionsReadOnly}
                  onChange={(value) => updateAnswer(field.id, value)}
                  value={answers[field.id] ?? ''}
                />
              ) : (
                <FormFileField
                  field={field}
                  files={obligation.draft?.files[field.id] ?? []}
                  formId={form.id}
                  isReadOnly={areQuestionsReadOnly}
                  onBusyChange={handleFileBusyChange}
                  onChanged={() => router.refresh()}
                />
              )}

              {prefilledFieldIds.includes(field.id) ? (
                <StatusBadge tone="information">{t('prefilled')}</StatusBadge>
              ) : null}
              {blocker !== undefined ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive animate-in duration-200 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
                  <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0" />
                  {t(`blocker.${blocker.reason}`)}
                </p>
              ) : null}
            </Field>
          </div>
        </BlurFade>
      );
    });
  }

  return (
    <section aria-label={form.title} className="flex flex-col gap-4">
      {/* Mounted from the start, so the success is announced when it arrives. */}
      <p className="sr-only" role="status">
        {confirmedSubmission === null
          ? ''
          : t('confirmation.announcement', { status: statusT(status) })}
      </p>

      {confirmedSubmission !== null ? (
        <SubmissionConfirmation
          statusLabel={statusT(status)}
          submittedAt={confirmedSubmission.submittedAt}
        >
          {renderQuestions(true)}
        </SubmissionConfirmation>
      ) : (
        <>
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

          {/* Held still while submitting, so what is on screen is what was sent. */}
          {renderQuestions(isReadOnly || isSubmitting)}

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

              {isFormGone ? (
                <Alert variant="destructive">
                  <AlertCircleIcon aria-hidden="true" />
                  <AlertDescription>{errorT('formNotFound')}</AlertDescription>
                </Alert>
              ) : (
                <SaveStatus
                  canAdoptServerAnswers={conflict !== null}
                  onAdoptServerAnswers={() => {
                    /*
                     * The Student chose the other version. It replaces what is on
                     * screen only because they asked for it, and is then saved so
                     * both sides agree.
                     */
                    if (conflict === null) return;
                    answersRef.current = conflict;
                    setAnswers(conflict);
                    setPrefilledFieldIds([]);
                    setConflict(null);
                    void save(conflict);
                  }}
                  onRetry={() => void save(answersRef.current)}
                  state={saveState}
                />
              )}

              {submitError !== null && !isFormGone ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorT(submitError)}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={isFormGone || isSubmitting || isWaitingForFiles}
                  onClick={() => void handleSubmit()}
                  type="button"
                >
                  {isSubmitting || isWaitingForFiles ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <SendIcon aria-hidden="true" />
                  )}
                  {submitLabel}
                </Button>
                <Button
                  disabled={isFormGone || isSubmitting || saveState.kind === 'saving'}
                  onClick={() => void save(answersRef.current)}
                  type="button"
                  variant="outline"
                >
                  {t('saveDraft')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{t('submitHint')}</p>
            </>
          )}
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
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {/*
       * The live region itself stays mounted so every change is announced; only
       * its content is keyed, so each new state fades in rather than swapping.
       */}
      <span
        className="inline-flex items-center gap-2 animate-in duration-200 fade-in-0 motion-reduce:animate-none"
        key={state.kind}
      >
        {state.kind === 'saving' ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
        {state.kind === 'saved' ? (
          <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
        ) : null}
        {t(`save.${state.kind}`)}
      </span>
    </p>
  );
}
