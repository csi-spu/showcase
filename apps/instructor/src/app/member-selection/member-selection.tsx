'use client';

import { Button } from '@showcase/ui/button';
import { ArrowLeftIcon, CheckIcon, ListChecksIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useActionState,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import type { MemberSelectionReads } from '@/lib/member-selection-contract';
import type { CollectionGroupsErrorMessage } from '../collection-groups-state';
import { CsvImport } from './csv-import';
import { IneligibleNotice, MemberConfirmation } from './member-confirmation';
import {
  csvProblems,
  csvProgress,
  INITIAL_MEMBER_SELECTION_STATE,
  memberSelectionReducer,
} from './member-selection-state';
import { StudentPicker } from './student-picker';

/*
 * Everything above a step's actions. When the space the host gives is short,
 * this scrolls instead of spilling over the actions, which stay in view. The
 * padding keeps focus rings from being clipped by the scroll edge.
 */
const STEP_BODY_CLASS = '-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1';

export interface MemberSubmitResult {
  error: CollectionGroupsErrorMessage | null;
  ineligibleAccountIds: string[];
}

/*
 * Choose Students from the roster table and/or a CSV file, review the full
 * list, then submit it with the host's own fields. Core rechecks every Student
 * on submit; those it refuses leave the selection and are named on review.
 */
export function MemberSelection({
  canReview = true,
  groupId,
  hiddenFields,
  back,
  openFormsCount = null,
  reads,
  submit,
  submitLabel,
}: {
  /** False while a host field the submission needs is still invalid. */
  canReview?: boolean;
  /** The group Students are added to; null while the group is being created. */
  groupId: string | null;
  hiddenFields?: ReactNode;
  /** A host step before this one, such as naming the group. */
  back?: { label: string; onClick: () => void };
  openFormsCount?: number | null;
  reads: MemberSelectionReads;
  submit: (formData: FormData) => Promise<MemberSubmitResult>;
  submitLabel: string;
}) {
  const t = useTranslations('Groups.selection');
  const errorT = useTranslations('Groups.errors');
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasMounted = useRef(false);
  const [state, dispatch] = useReducer(memberSelectionReducer, INITIAL_MEMBER_SELECTION_STATE);
  const [step, setStep] = useState<'confirm' | 'pick'>('pick');
  // One key per intended submission, so a retried request cannot create twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitError, formAction] = useActionState(
    async (_previous: CollectionGroupsErrorMessage | null, formData: FormData) => {
      const result = await submit(formData);
      if (result.error === null) {
        dispatch({ type: 'submitted' });
        setIdempotencyKey(crypto.randomUUID());
        setStep('pick');
        return null;
      }
      if (result.error === 'memberNotSelectable') {
        dispatch({ accountIds: result.ineligibleAccountIds, type: 'ineligibleRejected' });
      }
      return result.error;
    },
    null,
  );

  const selected = [...state.selection.values()];
  const problems = state.csv === null ? [] : csvProblems(state.csv);
  const progress = state.csv === null ? 'resolved' : csvProgress(state.csv);
  const isCsvBlocking = progress !== 'resolved';
  const canContinue = selected.length > 0 && !isCsvBlocking && canReview;
  // Review has nothing to confirm once the recheck removed everyone, and the
  // next table pick must not skip straight back to it.
  if (step === 'confirm' && selected.length === 0) {
    setStep('pick');
  }
  const isConfirming = step === 'confirm' && selected.length > 0;

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [isConfirming]);

  if (isConfirming) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex min-h-0 flex-1 animate-in flex-col gap-4 duration-300 fade-in slide-in-from-right-2 motion-reduce:animate-none"
      >
        <div className={STEP_BODY_CLASS}>
          <h3
            className="text-base font-semibold text-foreground outline-none"
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
          >
            {t('confirmTitle')}
          </h3>
          {submitError !== null && submitError !== 'memberNotSelectable' ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(submitError)}</AlertDescription>
            </Alert>
          ) : null}
          <MemberConfirmation
            csvProblems={problems}
            ineligible={state.ineligible}
            openFormsCount={openFormsCount}
            students={selected}
          />
        </div>
        <form
          action={formAction}
          className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/80 pt-4"
        >
          {hiddenFields}
          <input
            name="memberAccountIds"
            type="hidden"
            value={JSON.stringify(selected.map((student) => student.accountId))}
          />
          <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
          <Button onClick={() => setStep('pick')} type="button" variant="outline">
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            {t('back')}
          </Button>
          <SubmitButton isDisabled={selected.length === 0} label={submitLabel} />
        </form>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 flex-1 animate-in flex-col gap-4 duration-300 fade-in slide-in-from-right-2 motion-reduce:animate-none"
    >
      <div className={STEP_BODY_CLASS}>
        <div className="flex shrink-0 flex-col gap-1">
          <h3
            className="text-base font-semibold text-foreground outline-none"
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
          >
            {t('pickTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('pickDescription')}</p>
        </div>
        <IneligibleNotice students={state.ineligible} />
        <CsvImport dispatch={dispatch} groupId={groupId} reads={reads} state={state} />
        <StudentPicker
          dispatch={dispatch}
          groupId={groupId}
          reads={reads}
          selection={state.selection}
        />
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {isCsvBlocking ? t('csvBlocking') : selected.length === 0 ? t('required') : null}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {back === undefined ? null : (
            <Button onClick={back.onClick} type="button" variant="outline">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {back.label}
            </Button>
          )}
          <Button disabled={!canContinue} onClick={() => setStep('confirm')} type="button">
            <ListChecksIcon aria-hidden="true" data-icon="inline-start" />
            {t('review')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SubmitButton({ isDisabled, label }: { isDisabled: boolean; label: string }) {
  const t = useTranslations('Groups');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending || isDisabled} type="submit">
      {pending ? (
        <Spinner aria-label={t('saving')} data-icon="inline-start" />
      ) : (
        <CheckIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? t('saving') : label}
    </Button>
  );
}
