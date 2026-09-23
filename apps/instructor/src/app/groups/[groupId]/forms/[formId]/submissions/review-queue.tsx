'use client';

import { Button, buttonVariants } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { Textarea } from '@showcase/ui/textarea';
import { CheckIcon, DownloadIcon, HistoryIcon, InboxIcon, UndoIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
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
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  INITIAL_FORM_ACTION_STATE,
  type CollectionFormActionState,
} from '@/app/collection-forms-state';
import type {
  InstructorCollectionField,
  InstructorCollectionFile,
  InstructorReviewEntry,
} from '@/lib/instructor-collection-forms-contract';

type CheckAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

/* Tone carries meaning, never colour alone: every badge also states its status. */
const STATUS_TONES: Record<InstructorReviewEntry['status'], StatusTone> = {
  awaiting_checking: 'information',
  changes_required: 'warning',
  not_submitted: 'muted',
  passed: 'success',
  withdrawn: 'muted',
};

export function ReviewQueue({
  checkAction,
  entries,
  fields,
  formId,
  groupId,
}: {
  checkAction: CheckAction;
  entries: InstructorReviewEntry[];
  fields: InstructorCollectionField[];
  formId: string;
  groupId: string;
}) {
  const t = useTranslations('Forms');

  if (entries.length === 0) {
    return (
      <EmptyState
        description={t('review.emptyDescription')}
        icon={InboxIcon}
        title={t('review.empty')}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('review.columnName')}</TableHead>
          <TableHead>{t('review.columnStatus')}</TableHead>
          <TableHead className="hidden sm:table-cell">{t('review.columnSubmittedAt')}</TableHead>
          <TableHead className="text-right">{t('review.columnActions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <ReviewRow
            checkAction={checkAction}
            entry={entry}
            fields={fields}
            formId={formId}
            groupId={groupId}
            key={entry.studentAccountId}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function ReviewRow({
  checkAction,
  entry,
  fields,
  formId,
  groupId,
}: {
  checkAction: CheckAction;
  entry: InstructorReviewEntry;
  fields: InstructorCollectionField[];
  formId: string;
  groupId: string;
}) {
  const t = useTranslations('Forms');
  const format = useFormatter();
  const name = `${entry.rosterName.firstNameTh} ${entry.rosterName.lastNameTh}`;
  const submission = entry.latestSubmission;

  return (
    <TableRow>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell>
        <StatusBadge tone={STATUS_TONES[entry.status]}>
          {t(`obligationStatus.${entry.status}`)}
        </StatusBadge>
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
        {submission === null
          ? t('review.notSubmittedYet')
          : format.dateTime(new Date(submission.submittedAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* History only exists once something was submitted, so it appears with the review action. */}
          {submission === null ? null : (
            <>
              <Link
                aria-label={t('history.openActionLabel', { name })}
                className={buttonVariants({ size: 'sm', variant: 'ghost' })}
                href={`/groups/${groupId}/forms/${formId}/students/${entry.studentAccountId}`}
              >
                <HistoryIcon aria-hidden="true" data-icon="inline-start" />
                {t('history.openAction')}
              </Link>
              <SubmissionDialog
                checkAction={checkAction}
                entry={entry}
                fields={fields}
                name={name}
                submission={submission}
              />
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Shows one submission and records a decision on it.
 *
 * The submission id travels with the decision, so a verdict always names the
 * exact submission that was read here.
 */
function SubmissionDialog({
  checkAction,
  entry,
  fields,
  name,
  submission,
}: {
  checkAction: CheckAction;
  entry: InstructorReviewEntry;
  fields: InstructorCollectionField[];
  name: string;
  submission: NonNullable<InstructorReviewEntry['latestSubmission']>;
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const router = useRouter();
  const reasonId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [decision, setDecision] = useState<'changes_required' | 'passed'>('passed');
  const [state, formAction] = useActionState(
    async (previousState: CollectionFormActionState, formData: FormData) => {
      const nextState = await checkAction(previousState, formData);
      if (nextState.error !== null) {
        toast.error(errorT(nextState.error));
        return nextState;
      }
      toast.success(t('review.saved'));
      setIsOpen(false);
      router.refresh();
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  return (
    <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="ghost">
            {t('review.openAction')}
            <span className="sr-only">{` ${name}`}</span>
          </Button>
        }
      />
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogTitle>{name}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('review.submissionVersion', { version: submission.version })}
        </AlertDialogDescription>

        {entry.latestCheckingReason === null ? null : (
          <Alert>
            <AlertDescription>
              <span className="font-medium">{t('review.latestReason')}: </span>
              {entry.latestCheckingReason}
            </AlertDescription>
          </Alert>
        )}

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{t('review.answersHeading')}</h3>
          <dl className="flex flex-col gap-3">
            {fields.map((field) => (
              <div className="flex flex-col gap-1" key={field.id}>
                <dt className="text-sm font-medium">{field.label}</dt>
                <dd className="text-sm text-muted-foreground">
                  {field.type === 'file_upload' ? (
                    <FileList files={submission.files[field.id] ?? []} />
                  ) : (
                    formatAnswer(submission.answers[field.id], t('review.noAnswer'))
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <form action={formAction} className="flex flex-col gap-4">
          <input name="submissionId" type="hidden" value={submission.id} />
          <input name="decision" type="hidden" value={decision} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{t('review.reviewHeading')}</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                aria-pressed={decision === 'passed'}
                onClick={() => setDecision('passed')}
                size="sm"
                type="button"
                variant={decision === 'passed' ? 'default' : 'outline'}
              >
                <CheckIcon aria-hidden="true" data-icon="inline-start" />
                {t('review.pass')}
              </Button>
              <Button
                aria-pressed={decision === 'changes_required'}
                onClick={() => setDecision('changes_required')}
                size="sm"
                type="button"
                variant={decision === 'changes_required' ? 'default' : 'outline'}
              >
                <UndoIcon aria-hidden="true" data-icon="inline-start" />
                {t('review.requestChanges')}
              </Button>
            </div>
          </fieldset>

          {decision === 'changes_required' ? (
            <Field>
              <FieldLabel htmlFor={reasonId}>{t('review.reasonLabel')}</FieldLabel>
              <Textarea id={reasonId} name="reason" required rows={4} />
              <FieldDescription>{t('review.reasonHint')}</FieldDescription>
            </Field>
          ) : (
            <input name="reason" type="hidden" value="" />
          )}

          <Alert>
            <AlertDescription>
              {decision === 'passed'
                ? t('review.passDescription')
                : t('review.requestChangesDescription')}
            </AlertDescription>
          </Alert>

          {state.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{errorT(state.error)}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('review.cancel')}</Button>} />
            <SubmitButton />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Lists attached documents.
 *
 * Only a file that passed inspection can be downloaded; anything else says so
 * in words rather than offering a link that would fail.
 */
function FileList({ files }: { files: InstructorCollectionFile[] }) {
  const t = useTranslations('Forms');

  if (files.length === 0) return <>{t('review.noAnswer')}</>;

  return (
    <ul className="flex list-none flex-col gap-1 p-0">
      {files.map((file) => (
        <li className="flex flex-wrap items-center gap-2" key={file.id}>
          <span className="truncate">{file.originalFilename}</span>
          {file.status === 'ready' ? (
            <a
              className="inline-flex items-center gap-1 rounded-control text-sm font-medium text-accent-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              download={file.originalFilename}
              href={`/files/${file.id}/download`}
            >
              <DownloadIcon aria-hidden="true" className="size-3.5" />
              <span aria-hidden="true">{t('review.download')}</span>
              <span className="sr-only">
                {t('review.downloadLabel', { filename: file.originalFilename })}
              </span>
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">{t('review.fileNotReady')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Renders any answer shape the field types can produce as readable text. */
function formatAnswer(value: unknown, emptyLabel: string): string {
  if (value === null || value === undefined || value === '') return emptyLabel;
  if (Array.isArray(value)) {
    return value.length === 0 ? emptyLabel : value.map(String).join(', ');
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return emptyLabel;
}

function SubmitButton() {
  const t = useTranslations('Forms');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : null}
      {pending ? t('review.saving') : t('review.confirm')}
    </Button>
  );
}
