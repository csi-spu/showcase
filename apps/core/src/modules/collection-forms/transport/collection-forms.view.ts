import type {
  CollectionExportJob,
  CollectionFile,
  CollectionForm,
  CollectionNotification,
  CollectionReviewEntry,
  CollectionStudentAnswer,
  CollectionSubmissionHistory,
  DraftFileSelection,
  StudentObligation,
} from '../application/collection-forms.ports';
import type { CollectionFormHistoryPage } from '../application/collection-form-history';
import type {
  CollectionReviewPage,
  CollectionReviewPosition,
  CollectionReviewStudent,
} from '../application/collection-review-queue';
import { isPreviewableFile } from '../application/collection-files';
import type {
  CollectionFieldSummary,
  CollectionResponseTotals,
  CollectionValueCount,
} from '../application/collection-responses';

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

/**
 * A submitted file as the Instructor sees it.
 *
 * `isPreviewable` is derived here so the detected content type, which is
 * inspection metadata, stays inside Core.
 */
export interface InstructorCollectionFileView extends CollectionFileView {
  isPreviewable: boolean;
}

export function toInstructorFileView(file: CollectionFile): InstructorCollectionFileView {
  return { ...toFileView(file), isPreviewable: isPreviewableFile(file) };
}

function toFileSelectionView<T>(
  selection: DraftFileSelection,
  projectFile: (file: CollectionFile) => T,
): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(selection).map(([fieldId, files]) => [fieldId, files.map(projectFile)]),
  );
}

/**
 * The Instructor review queue as an HTTP response.
 *
 * An index of Students and where each response stands. Answers and files are
 * read per Student or per question, so they are not part of this list.
 */
function toReviewEntryView(entry: CollectionReviewEntry) {
  return {
    firstSubmittedAt: entry.firstSubmittedAt?.toISOString() ?? null,
    isLate: entry.isLate,
    latestCheckingReason: entry.latestCheckingReason,
    latestSubmission:
      entry.latestSubmission === null
        ? null
        : {
            formVersion: entry.latestSubmission.formVersion,
            id: entry.latestSubmission.id,
            submittedAt: entry.latestSubmission.submittedAt.toISOString(),
            version: entry.latestSubmission.version,
          },
    rosterName: entry.rosterName,
    status: entry.status,
    studentAccountId: entry.studentAccountId,
    studentId: entry.studentId,
  };
}

/* A Student as a jump list names them: never their Student ID. */
function toReviewStudentView(student: CollectionReviewStudent) {
  return { rosterName: student.rosterName, studentAccountId: student.studentAccountId };
}

export function toReviewQueueView(input: CollectionReviewPage & { form: CollectionForm }) {
  return {
    entries: input.entries.map(toReviewEntryView),
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
    page: input.page,
    statusCounts: input.statusCounts,
    total: input.total,
  };
}

export function toReviewPositionView(position: CollectionReviewPosition) {
  return {
    entry: toReviewEntryView(position.entry),
    next: position.next === null ? null : toReviewStudentView(position.next),
    page: position.page,
    pageStudents: position.pageStudents.map(toReviewStudentView),
    position: position.position,
    previous: position.previous === null ? null : toReviewStudentView(position.previous),
    total: position.total,
  };
}

export function toObligationView(obligation: StudentObligation) {
  return {
    draft:
      obligation.draft === null
        ? null
        : {
            answers: obligation.draft.answers,
            files: toFileSelectionView(obligation.draft.files, toFileView),
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
            files: toFileSelectionView(obligation.latestSubmission.files, toFileView),
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
 * that the Student who wrote it may not. The Instructor passes
 * `toInstructorFileView` to learn which images can be shown inline.
 */
export function toSubmissionHistoryView(
  history: CollectionSubmissionHistory,
  projectFile: (file: CollectionFile) => CollectionFileView = toFileView,
) {
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
      files: toFileSelectionView(entry.files, projectFile),
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

/**
 * The Summary view. Totals and aggregates only: no row here can name a
 * Student, which is what makes the view anonymous.
 */
export function toResponseSummaryView(summary: {
  fields: CollectionFieldSummary[];
  form: CollectionForm;
  totals: CollectionResponseTotals;
}) {
  return {
    fields: summary.fields,
    form: {
      fields: summary.form.fields,
      id: summary.form.id,
      status: summary.form.status,
      title: summary.form.title,
    },
    totals: summary.totals,
  };
}

/** One page of one question's answers, shaped by what was asked for. */
export function toFieldAnswersView(
  page:
    | { items: CollectionStudentAnswer[]; kind: 'students'; nextCursor: string | null }
    | { items: CollectionValueCount[]; kind: 'groups'; nextCursor: string | null }
    | { items: string[]; kind: 'texts'; nextCursor: string | null },
) {
  switch (page.kind) {
    case 'students':
      return {
        items: page.items.map((answer) => ({
          files: answer.files.map(toInstructorFileView),
          rosterName: answer.rosterName,
          studentAccountId: answer.studentAccountId,
          studentId: answer.studentId,
          value: answer.value,
        })),
        kind: page.kind,
        nextCursor: page.nextCursor,
      };
    case 'groups':
      return {
        items: page.items.map((group) => ({ count: group.count, value: group.value })),
        kind: page.kind,
        nextCursor: page.nextCursor,
      };
    case 'texts':
      return {
        items: page.items.map((value) => ({ value })),
        kind: page.kind,
        nextCursor: page.nextCursor,
      };
  }
}
