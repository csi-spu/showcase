'use client';

import { Button } from '@showcase/ui/button';
import { Textarea } from '@showcase/ui/textarea';
import { toast } from '@showcase/ui/toast';
import { CheckIcon, UndoIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  INITIAL_FORM_ACTION_STATE,
  type CollectionFormActionState,
} from '@/app/collection-forms-state';
import { NEXT_STUDENT_LINK_ID } from './student-navigator';

type CheckAction = (
  previousState: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

type Decision = 'changes_required' | 'passed';

/**
 * Passes the latest version or sends it back for changes.
 *
 * The version it was rendered for travels with the decision, so a Student who
 * resubmitted meanwhile is reported as stale instead of being decided blind;
 * the page then reloads onto the new version. After a save, focus moves to the
 * next Student but the page stays, so the result can be read before moving on.
 */
export function DecisionForm({
  checkAction,
  submissionId,
}: {
  checkAction: CheckAction;
  submissionId: string;
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const reasonId = useId();
  const [decision, setDecision] = useState<Decision>('passed');
  const [hasSaved, setHasSaved] = useState(false);
  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await checkAction(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        /* Someone resubmitted or decided meanwhile: show what is current now. */
        if (nextState.error === 'submissionStale') router.refresh();
        return nextState;
      }
      toast.success(t('review.saved'));
      setHasSaved(true);
      router.refresh();
      document.getElementById(NEXT_STUDENT_LINK_ID)?.focus();
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  const choose = (next: Decision) => {
    setDecision(next);
    setHasSaved(false);
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="submissionId" type="hidden" value={submissionId} />
      <input name="decision" type="hidden" value={decision} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('review.reviewHeading')}</legend>
        <div className="grid grid-cols-2 gap-2">
          <DecisionToggle
            isSelected={decision === 'passed'}
            label={t('review.pass')}
            onSelect={() => choose('passed')}
          >
            <CheckIcon aria-hidden="true" data-icon="inline-start" />
          </DecisionToggle>
          <DecisionToggle
            isSelected={decision === 'changes_required'}
            label={t('review.requestChanges')}
            onSelect={() => choose('changes_required')}
          >
            <UndoIcon aria-hidden="true" data-icon="inline-start" />
          </DecisionToggle>
        </div>
      </fieldset>

      {decision === 'changes_required' ? (
        <Field className="animate-in duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none">
          <FieldLabel htmlFor={reasonId}>{t('review.reasonLabel')}</FieldLabel>
          <Textarea
            id={reasonId}
            name="reason"
            onChange={() => setHasSaved(false)}
            required
            rows={4}
          />
          <FieldDescription>{t('review.reasonHint')}</FieldDescription>
        </Field>
      ) : (
        <input name="reason" type="hidden" value="" />
      )}

      <p className="text-sm text-muted-foreground">
        {decision === 'passed'
          ? t('review.passDescription')
          : t('review.requestChangesDescription')}
      </p>

      {state.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{errorT(state.error)}</AlertDescription>
        </Alert>
      )}

      <SubmitButton hasSaved={hasSaved} />
    </form>
  );
}

function DecisionToggle({
  children,
  isSelected,
  label,
  onSelect,
}: {
  children: ReactNode;
  isSelected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Button
      aria-pressed={isSelected}
      className="transition-[background-color,color,scale] active:scale-95 motion-reduce:transition-none"
      onClick={onSelect}
      type="button"
      variant={isSelected ? 'default' : 'outline'}
    >
      {children}
      {label}
    </Button>
  );
}

function SubmitButton({ hasSaved }: { hasSaved: boolean }) {
  const t = useTranslations('Forms');
  const { pending } = useFormStatus();

  return (
    <Button
      className="transition-[scale] active:scale-95 motion-reduce:transition-none"
      disabled={pending}
      type="submit"
      variant={hasSaved && !pending ? 'outline' : 'default'}
    >
      {pending ? <Spinner aria-hidden="true" /> : null}
      {!pending && hasSaved ? (
        <CheckIcon
          aria-hidden="true"
          className="animate-in duration-200 zoom-in-50 motion-reduce:animate-none"
          data-icon="inline-start"
        />
      ) : null}
      {pending
        ? t('review.saving')
        : hasSaved
          ? t('responses.individual.saved')
          : t('review.confirm')}
    </Button>
  );
}
