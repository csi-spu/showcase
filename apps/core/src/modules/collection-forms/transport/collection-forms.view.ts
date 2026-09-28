import type {
  CollectionExportJob,
  CollectionFile,
  CollectionForm,
  CollectionNotification,
  CollectionReviewEntry,
  CollectionSubmissionHistory,
  DraftFileSelection,
  StudentObligation,
} from '../application/collection-forms.ports';
import type { CollectionFormHistoryPage } from '../application/collection-form-history';

/*
 * Transport views for the collection surfaces.
 *
 * The domain objects carry `studentAccountId` because persistence needs it to
 * scope every row. The Student's own client has no use for it -- it can only
 * ever be the caller's own id -- so it is dropped here rather than sent and
 * ignored. Keeping the projection explicit means a new internal column cannot
 * reach the browser just by being added to a row.
 */

export interface CollectionFileView {
  byteSize: number;
  createdAt: string;
  fieldId: string;
  id: string;
  /** Set only once an inspection has recorded why a file was rejected. */
  inspectionErrorCode: string | null;
  originalFilename: string;
  status: CollectionFile['status'];
}

export function toFileView(file: CollectionFile): CollectionFileView {
  return {
    byteSize: file.byteSize,
    createdAt: file.createdAt.toISOString(),
    fieldId: file.fieldId,
    id: file.id,
    inspectionErrorCode: file.inspectionErrorCode,
    originalFilename: file.originalFilename,
    status: file.status,
  };
}

function toFileSelectionView(selection: DraftFileSelection): Record<string, CollectionFileView[]> {
  return Object.fromEntries(
    Object.entries(selection).map(([fieldId, files]) => [fieldId, files.map(toFileView)]),
  );
}

/**
 * The Instructor review queue as an HTTP response.
 *
 * A submitted file still carries ownership and inspection metadata inside Core.
 * Project every file explicitly so those persistence fields cannot cross the
 * transport boundary when the domain object gains a new property.
 */
export function toReviewQueueView(input: {
  entries: CollectionReviewEntry[];
  form: CollectionForm;
}) {
  return {
    entries: input.entries.map((entry) => ({
      firstSubmittedAt: entry.firstSubmittedAt?.toISOString() ?? null,
      isLate: entry.isLate,
      latestCheckingReason: entry.latestCheckingReason,
      latestSubmission:
        entry.latestSubmission === null
          ? null
          : {
              answers: entry.latestSubmission.answers,
              fields: entry.latestSubmission.fields,
              files: toFileSelectionView(entry.latestSubmission.files),
              formVersion: entry.latestSubmission.formVersion,
              id: entry.latestSubmission.id,
              submittedAt: entry.latestSubmission.submittedAt.toISOString(),
              version: entry.latestSubmission.version,
            },
      rosterName: entry.rosterName,
      status: entry.status,
      studentAccountId: entry.studentAccountId,
      studentId: entry.studentId,
    })),
    form: {
      createdFromTemplateId: input.form.createdFromTemplateId,
      deadlineAt: input.form.deadlineAt?.toISOString() ?? null,
      description: input.form.description,
      fields: input.form.fields,
      groupId: input.form.groupId,
      id: input.form.id,
      status: input.form.status,
      title: input.form.title,
      version: input.form.version,
    },
  };
}

export function toObligationView(obligation: StudentObligation) {
  return {
    draft:
      obligation.draft === null
        ? null
        : {
            answers: obligation.draft.answers,
            files: toFileSelectionView(obligation.draft.files),
            updatedAt: obligation.draft.updatedAt.toISOString(),
            version: obligation.draft.version,
          },
    form: {
      createdFromTemplateId: obligation.form.createdFromTemplateId,
      deadlineAt: obligation.form.deadlineAt?.toISOString() ?? null,
      description: obligation.form.description,
      fields: obligation.form.fields,
      groupId: obligation.form.groupId,
      id: obligation.form.id,
      status: obligation.form.status,
      title: obligation.form.title,
      version: obligation.form.version,
    },
    firstSubmittedAt: obligation.firstSubmittedAt?.toISOString() ?? null,
    hasDeadlinePassed: obligation.hasDeadlinePassed,
    isLate: obligation.isLate,
    isWritable: obligation.isWritable,
    latestCheckingReason: obligation.latestCheckingReason,
    latestSubmission:
      obligation.latestSubmission === null
        ? null
        : {
            answers: obligation.latestSubmission.answers,
            fields: obligation.latestSubmission.fields,
            files: toFileSelectionView(obligation.latestSubmission.files),
            formVersion: obligation.latestSubmission.formVersion,
            id: obligation.latestSubmission.id,
            submittedAt: obligation.latestSubmission.submittedAt.toISOString(),
            version: obligation.latestSubmission.version,
          },
    rosterName: obligation.rosterName,
    status: obligation.status,
  };
}

/**
 * Every retained version of one response.
 *
 * The same projection serves both audiences: it carries only submitted content
 * and the decisions against it, so there is nothing here an Instructor may see
 * that the Student who wrote it may not.
 */
export function toSubmissionHistoryView(history: CollectionSubmissionHistory) {
  return {
    entries: history.entries.map((entry) => ({
      answers: entry.answers,
      checkingEvents: entry.checkingEvents.map((event) => ({
        decision: event.decision,
        instructorName: event.instructorName,
        occurredAt: event.occurredAt.toISOString(),
        reason: event.reason,
      })),
      fields: entry.fields,
      files: toFileSelectionView(entry.files),
      formVersion: entry.formVersion,
      id: entry.id,
      submittedAt: entry.submittedAt.toISOString(),
      version: entry.version,
    })),
    firstSubmittedAt: history.firstSubmittedAt?.toISOString() ?? null,
    form: {
      deadlineAt: history.form.deadlineAt?.toISOString() ?? null,
      fields: history.form.fields,
      id: history.form.id,
      status: history.form.status,
      title: history.form.title,
    },
    isLate: history.isLate,
    status: history.status,
  };
}

/**
 * One notification as the Student's client sees it.
 *
 * `studentAccountId` is dropped for the same reason as everywhere else here: it
 * can only be the caller's own, so sending it back adds nothing.
 */
export interface CollectionNotificationView {
  createdAt: string;
  deadlineAt: string | null;
  formId: string;
  formTitle: string;
  groupId: string;
  id: string;
  isRead: boolean;
  kind: string;
}

export function toNotificationView(
  notification: CollectionNotification,
): CollectionNotificationView {
  return {
    createdAt: notification.createdAt.toISOString(),
    deadlineAt: notification.deadlineAt?.toISOString() ?? null,
    formId: notification.formId,
    formTitle: notification.formTitle,
    groupId: notification.groupId,
    id: notification.id,
    isRead: notification.isRead,
    kind: notification.kind,
  };
}

/**
 * One export job as the Instructor surface sees it.
 *
 * `requestedByAccountId` is deliberately absent: an Instructor acts on any
 * group's exports, so who requested one is audit information rather than
 * something the dashboard needs. Nothing here names a Student.
 */
export interface CollectionExportView {
  byteSize: number | null;
  errorCode: string | null;
  expiresAt: string | null;
  id: string;
  kind: string;
  readyAt: string | null;
  requestedAt: string;
  status: string;
}

export function toExportView(job: CollectionExportJob): CollectionExportView {
  return {
    byteSize: job.byteSize,
    errorCode: job.errorCode,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    id: job.id,
    kind: job.kind,
    readyAt: job.readyAt?.toISOString() ?? null,
    requestedAt: job.requestedAt.toISOString(),
    status: job.status,
  };
}

/** A form's edit history page. Changes are already typed; only times need formatting. */
export function toFormHistoryView(history: CollectionFormHistoryPage) {
  return {
    entries: history.entries.map((entry) => ({
      actorName: entry.actorName,
      changes: entry.changes,
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
    })),
    nextCursor: history.nextCursor,
  };
}
