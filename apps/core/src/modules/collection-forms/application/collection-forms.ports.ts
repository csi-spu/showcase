import type { CollectionAnswers, CollectionField } from './collection-field';
import type { CollectionFile, CollectionFileStatus } from './collection-files';
import type { CollectionMatrixRow, CollectionMatrixSummary } from './collection-matrix';
import type { CollectionExportKind, CollectionExportStatus } from './collection-exports';
import type { CollectionNotificationKind } from './collection-notifications';
import type { ReusableValueCandidate } from './reusable-values';

export const COLLECTION_FORMS_REPOSITORY = Symbol('COLLECTION_FORMS_REPOSITORY');
export const COLLECTION_FILE_STORAGE = Symbol('COLLECTION_FILE_STORAGE');
export const COLLECTION_FILE_INSPECTOR = Symbol('COLLECTION_FILE_INSPECTOR');

/**
 * Private object storage for collection files.
 *
 * These objects are never public. There is deliberately no `createPublicUrl`
 * here, unlike Work media: every read is a short-lived signed GET issued only
 * after Core has authorized the caller for that specific file.
 */
export interface CollectionFileStorage {
  createPresignedPut(input: {
    contentType: string;
    expiresInSeconds: number;
    key: string;
  }): Promise<string>;
  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string>;
  deleteObject(key: string): Promise<void>;
  getObject(key: string, maximumBytes: number): Promise<Buffer>;
  /**
   * Streams an object into storage without holding it in memory.
   *
   * A group ZIP is far larger than any single document, so the export worker
   * writes it as it is generated. Returns how many bytes were stored, which is
   * what the export job records.
   */
  putObjectStream(input: {
    body: AsyncIterable<Buffer>;
    contentType: string;
    key: string;
  }): Promise<number>;
  /**
   * Streams an object out of storage in chunks.
   *
   * Used to copy one submitted document into the archive; the whole file is
   * never assembled, so a 5 MB document costs one chunk at a time.
   */
  getObjectStream(key: string): AsyncIterable<Buffer>;
}

/**
 * Examines the uploaded bytes themselves.
 *
 * `detectedContentType` is what the bytes actually are, which is the only thing
 * submission trusts. A null result means the bytes could not be identified and
 * the file must fail, never pass.
 */
export interface CollectionFileInspection {
  detectedContentType: string | null;
  errorCode: string | null;
  isAccepted: boolean;
}

export interface CollectionFileInspector {
  inspect(input: {
    bytes: Buffer;
    declaredContentType: string;
    filename: string;
  }): Promise<CollectionFileInspection>;
}

export type {
  CollectionAnswers,
  CollectionAnswerValue,
  CollectionField,
  CollectionFieldType,
  CollectionFileFieldConfig,
  CollectionFileType,
} from './collection-field';
export type { CollectionFile, CollectionFileStatus } from './collection-files';
export type {
  CollectionMatrixCell,
  CollectionMatrixCellStatus,
  CollectionMatrixRow,
  CollectionMatrixSummary,
} from './collection-matrix';
export type { CollectionExportKind, CollectionExportStatus } from './collection-exports';
export type { CollectionNotificationKind } from './collection-notifications';

export interface CollectionForm {
  createdFromTemplateId: string | null;
  deadlineAt: Date | null;
  description: string;
  fields: CollectionField[];
  groupId: string;
  id: string;
  status: 'closed' | 'draft' | 'open';
  title: string;
  version: number;
}

export interface CollectionFormTemplate {
  createdAt: Date;
  description: string;
  fields: CollectionField[];
  id: string;
  name: string;
  updatedAt: Date;
  version: number;
}

/** Files the Student has selected for a field, in display order. */
export type DraftFileSelection = Record<string, CollectionFile[]>;

export interface StudentObligation {
  draft: {
    answers: CollectionAnswers;
    files: DraftFileSelection;
    updatedAt: Date;
    version: number;
  } | null;
  /** When the Student first submitted. Retained unchanged across corrections. */
  firstSubmittedAt: Date | null;
  form: CollectionForm;
  /**
   * Whether the deadline is already behind us. Unlike `isLate` this is true
   * before anything is submitted, which is when the Student needs the warning.
   */
  hasDeadlinePassed: boolean;
  /**
   * Whether the first submission missed the deadline, derived against the
   * form's current deadline so an extension recalculates it.
   */
  isLate: boolean;
  /**
   * Whether a write would be accepted right now. The same decision the write
   * path enforces, so a closed round or form reaches the Student as a
   * read-only form rather than as a refusal after they have typed.
   */
  isWritable: boolean;
  /** Why the latest checking returned the submission, shown so the Student can act on it. */
  latestCheckingReason: string | null;
  latestSubmission: {
    answers: CollectionAnswers;
    fields: CollectionField[];
    files: DraftFileSelection;
    formVersion: number;
    id: string;
    submittedAt: Date;
    version: number;
  } | null;
  /** Read-only identity from the Student Roster; never a typed input. */
  rosterName: { firstNameTh: string; lastNameTh: string };
  status: 'awaiting_checking' | 'changes_required' | 'not_submitted' | 'passed' | 'withdrawn';
}

/**
 * One Student's standing on a form, as an Instructor reviewing it sees them.
 *
 * Only submitted content appears here. A Student's draft answers and the files
 * they have merely selected stay private until they choose to submit.
 */
export interface CollectionReviewEntry {
  firstSubmittedAt: Date | null;
  /** Derived against the form's current deadline, so an extension recalculates it. */
  isLate: boolean;
  latestCheckingReason: string | null;
  /** Null until the Student submits, which is what `not_submitted` means. */
  latestSubmission: {
    answers: CollectionAnswers;
    fields: CollectionField[];
    files: DraftFileSelection;
    formVersion: number;
    id: string;
    submittedAt: Date;
    version: number;
  } | null;
  /** Read-only identity from the Student Roster. Never a Student ID. */
  rosterName: { firstNameTh: string; lastNameTh: string };
  status: 'awaiting_checking' | 'changes_required' | 'not_submitted' | 'passed' | 'withdrawn';
  studentAccountId: string;
}

/**
 * One retained submitted version with the decision that followed it.
 *
 * History is append-only: checking the latest version never edits an older one,
 * so every entry here is exactly what was submitted at that time.
 */
export interface CollectionSubmissionHistoryEntry {
  answers: CollectionAnswers;
  /** Every decision recorded against this version, oldest first. */
  checkingEvents: {
    decision: 'changes_required' | 'passed';
    occurredAt: Date;
    /** The Instructor's display name; never an Account identifier the UI could act on. */
    instructorName: string;
    reason: string | null;
  }[];
  files: DraftFileSelection;
  fields: CollectionField[];
  formVersion: number;
  id: string;
  submittedAt: Date;
  version: number;
}

export interface CollectionSubmissionHistory {
  /** Derived against the form's current deadline, not stamped at submit time. */
  isLate: boolean;
  entries: CollectionSubmissionHistoryEntry[];
  firstSubmittedAt: Date | null;
  form: CollectionForm;
  status: StudentObligation['status'];
}

/**
 * One page of the Student-by-form matrix for a group.
 *
 * Both dimensions are bounded: rows are a cursor page over members and forms
 * are capped, because every row carries a cell per form. `nextCursor` is null
 * on the last page.
 */
export interface CollectionMatrixPage {
  forms: { deadlineAt: Date | null; id: string; status: CollectionForm['status']; title: string }[];
  nextCursor: string | null;
  rows: CollectionMatrixRow[];
  summary: CollectionMatrixSummary;
  /** Every current and withdrawn member of the group, not just this page. */
  totalMembers: number;
}

/** Unfinished obligations across a round, shown before closing it. */
export interface RoundPendingWork {
  awaitingChecking: number;
  changesRequired: number;
  notSubmitted: number;
}

/**
 * One in-website notification, as a Student reads it.
 *
 * Carries the form it concerns rather than its contents: a notification tells a
 * Student where to go, and the page they land on enforces its own authorization.
 */
export interface CollectionNotification {
  createdAt: Date;
  formId: string;
  formTitle: string;
  groupId: string;
  id: string;
  isRead: boolean;
  kind: CollectionNotificationKind;
  /** Set for a deadline reminder, so the Student sees what they are being reminded of. */
  deadlineAt: Date | null;
}

export interface CollectionNotificationFeed {
  notifications: CollectionNotification[];
  /** Unread across every obligation, not only the ones on this page. */
  unreadCount: number;
}

/** One notification the worker intends to deliver, before eligibility is rechecked. */
/**
 * One export job as an Instructor sees it.
 *
 * `expiresAt` is present only once the artifact is ready, which is also when
 * the 24-hour clock starts. It is stored rather than derived so what the
 * Instructor is shown and what a download decision uses cannot disagree.
 */
export interface CollectionExportJob {
  byteSize: number | null;
  errorCode: string | null;
  expiresAt: Date | null;
  groupId: string;
  id: string;
  kind: CollectionExportKind;
  readyAt: Date | null;
  requestedAt: Date;
  requestedByAccountId: string;
  status: CollectionExportStatus;
}

/** One form frozen into an export's snapshot, with its title and fields copied. */
export interface CollectionExportForm {
  fields: CollectionField[];
  formId: string;
  position: number;
  title: string;
}

/**
 * One frozen cell: what one Student had submitted for one form at creation.
 *
 * `submissionId` names an immutable row, which is what makes a later
 * submission unable to change a finished export without copying answers here.
 * It is null when nothing was submitted; a draft never appears.
 */
export interface CollectionExportEntry {
  fields: CollectionField[] | null;
  formId: string;
  isLate: boolean;
  obligationStatus: string;
  position: number;
  studentAccountId: string;
  studentDisplayName: string;
  submissionId: string | null;
  submittedAt: Date | null;
}

/** An export claimed by a worker, with the snapshot it must rebuild from. */
export interface ClaimedCollectionExport {
  attemptCount: number;
  entries: CollectionExportEntry[];
  forms: CollectionExportForm[];
  groupId: string;
  id: string;
  kind: CollectionExportKind;
  leaseId: string;
}

/** One submitted document named by an export entry, in stable field order. */
export interface CollectionExportDocument {
  fieldId: string;
  originalFilename: string;
  position: number;
  storageKey: string;
}

export interface PendingNotification {
  formId: string;
  kind: CollectionNotificationKind;
  studentAccountId: string;
  subjectKey: string;
}

export class CollectionFormsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** Set when the failure belongs to one field, so the UI can show it in place. */
    readonly fieldId: string | null = null,
  ) {
    super(code);
    this.name = 'CollectionFormsError';
  }
}

export interface CollectionFormsRepository {
  attachDraftFile(input: {
    fieldId: string;
    fileId: string;
    formId: string;
    studentAccountId: string;
  }): Promise<'attached' | 'forbidden' | 'not_found' | 'too_many'>;
  checkSubmission(input: {
    actorAccountId: string;
    decision: 'changes_required' | 'passed';
    expectedSubmissionId: string;
    now: Date;
    reason: string | null;
  }): Promise<'checked' | 'not_found' | 'round_closed' | 'stale'>;
  createForm(input: {
    actorAccountId: string;
    createdFromTemplateId: string | null;
    deadlineAt: Date | null;
    description: string;
    fields: CollectionField[];
    groupId: string;
    now: Date;
    title: string;
  }): Promise<CollectionForm | null>;
  createTemplate(input: {
    actorAccountId: string;
    description: string;
    fields: CollectionField[];
    name: string;
    now: Date;
  }): Promise<CollectionFormTemplate>;
  createUpload(input: {
    declaredContentType: string;
    fieldId: string;
    filename: string;
    formId: string;
    byteSize: number;
    now: Date;
    storageKey: string;
    studentAccountId: string;
  }): Promise<CollectionFile>;
  finalizeUpload(input: {
    fileId: string;
    formId: string;
    studentAccountId: string;
  }): Promise<'finalized' | 'not_found'>;
  detachDraftFile(input: {
    fileId: string;
    formId: string;
    studentAccountId: string;
  }): Promise<'detached' | 'not_found'>;
  /**
   * Moves one quarantined file to `inspecting`, claiming it for this worker.
   * Returns null when another worker got there first, which is what keeps two
   * workers from inspecting the same bytes.
   */
  claimFileForInspection(): Promise<{
    declaredContentType: string;
    id: string;
    leaseId: string;
    originalFilename: string;
    storageKey: string;
  } | null>;
  /** Records the inspection outcome. This is the only way a file becomes `ready`. */
  completeInspection(input: {
    detectedContentType: string | null;
    errorCode: string | null;
    fileId: string;
    isAccepted: boolean;
    leaseId: string;
    now: Date;
  }): Promise<void>;
  /**
   * Returns a file's storage key for download, only for a caller the query
   * itself proves may read it. Authorization is not left to the caller.
   */
  findReadableFile(input: {
    actorAccountId: string;
    fileId: string;
    isInstructor: boolean;
  }): Promise<{
    originalFilename: string;
    status: CollectionFileStatus;
    storageKey: string;
  } | null>;
  getForm(formId: string): Promise<CollectionForm | null>;
  getTemplate(templateId: string): Promise<CollectionFormTemplate | null>;
  /** Files already uploaded to one field, used to enforce the per-field count. */
  listFieldFiles(input: {
    fieldId: string;
    formId: string;
    now: Date;
    studentAccountId: string;
  }): Promise<CollectionFile[]>;
  listGroupForms(groupId: string): Promise<CollectionForm[]>;
  /**
   * Values from this Student's passed submissions in the same group. Eligibility
   * and group scoping are enforced in the query; ordering is decided in the
   * domain by submitted_at.
   */
  listReusableValues(input: {
    excludeFormId: string;
    groupId: string;
    studentAccountId: string;
  }): Promise<ReusableValueCandidate[]>;
  /**
   * The review queue for one form: every assigned Student and what they
   * submitted. Returns null when the form does not exist.
   */
  listFormSubmissions(formId: string): Promise<{
    form: CollectionForm;
    entries: CollectionReviewEntry[];
  } | null>;
  listStudentObligations(studentAccountId: string, now: Date): Promise<StudentObligation[]>;
  listTemplates(): Promise<CollectionFormTemplate[]>;
  openForm(input: {
    actorAccountId: string;
    formId: string;
    now: Date;
  }): Promise<CollectionForm | 'not_found' | 'not_draft' | 'round_closed'>;
  /**
   * Stops first submissions on an open form. Requested corrections and checking
   * continue, so this closes one door rather than ending the form.
   */
  closeForm(input: {
    actorAccountId: string;
    formId: string;
    now: Date;
    reason: string;
  }): Promise<CollectionForm | 'not_found' | 'not_open' | 'round_closed'>;
  /**
   * How many current members would gain an obligation if the form reopened now.
   * Shown for confirmation before the reopen is committed.
   */
  previewFormReopen(
    formId: string,
  ): Promise<{ newlyAssignedCount: number } | 'not_found' | 'not_closed'>;
  /**
   * Reopens a closed form to current members who have no obligation yet.
   * Existing submissions and checking outcomes are left untouched: reopening is
   * not a request for everyone to submit again.
   */
  reopenForm(input: {
    actorAccountId: string;
    formId: string;
    now: Date;
    reason: string;
  }): Promise<
    | { form: CollectionForm; newlyAssignedCount: number }
    | 'not_found'
    | 'not_closed'
    | 'round_closed'
  >;
  /** Outstanding obligations across a round, excluding withdrawn members. */
  getRoundPendingWork(roundId: string): Promise<RoundPendingWork | null>;
  /**
   * One bounded page of the group matrix.
   *
   * Members are paged by a cursor over the stable ordering; forms are capped.
   * Returns null when the group does not exist.
   */
  readGroupMatrix(input: {
    afterStudentAccountId: string | null;
    groupId: string;
    limit: number;
  }): Promise<CollectionMatrixPage | null>;
  /**
   * Records notifications that are still eligible when they are delivered.
   *
   * Eligibility is rechecked inside the write, so a round that closed or a
   * membership that was withdrawn between queueing and dispatch suppresses the
   * row rather than delivering it. Returns how many were actually recorded.
   */
  recordNotifications(input: { notifications: PendingNotification[]; now: Date }): Promise<number>;
  /** Obligations whose deadline reminders are now due and not yet delivered. */
  findDueReminders(input: { limit: number; now: Date }): Promise<PendingNotification[]>;
  readNotificationFeed(input: {
    limit: number;
    studentAccountId: string;
  }): Promise<CollectionNotificationFeed>;
  /** Marks a Student's notifications read. Only their own rows are touched. */
  markNotificationsRead(input: {
    notificationIds: string[];
    now: Date;
    studentAccountId: string;
  }): Promise<number>;
  /**
   * Creates an export and freezes its snapshot in one transaction.
   *
   * The selected forms, the Students in scope, their display names, and the
   * exact submission each had at this instant are all written here. Nothing
   * read later can change what this export will contain, which is what makes a
   * retry reproduce the same artifact.
   *
   * Returns null when the group does not exist.
   */
  createExport(input: {
    formIds: string[];
    groupId: string;
    kind: CollectionExportKind;
    maxForms: number;
    maxStudents: number;
    now: Date;
    requestedByAccountId: string;
  }): Promise<CollectionExportJob | null>;
  /** One export, for a status poll or a download authorization check. */
  getExport(exportId: string): Promise<CollectionExportJob | null>;
  /**
   * The answers of one frozen submission.
   *
   * Read one at a time by the export builder, which is what keeps a workbook
   * covering a whole cohort bounded. A submission row is immutable, so this
   * returns the same answers however long after the snapshot it is called.
   */
  readSubmissionAnswers(submissionId: string): Promise<CollectionAnswers | null>;
  /** One bounded page of a group's export history, newest first. */
  listGroupExports(input: { groupId: string; limit: number }): Promise<CollectionExportJob[]>;
  /**
   * Claims the oldest unfinished export for this worker.
   *
   * Leased the same way file inspection is, so a worker that dies mid-archive
   * releases the job by letting the lease lapse rather than stranding it.
   * Returns the frozen snapshot with the claim, because the worker must never
   * re-read live data to build the artifact.
   */
  claimExportForBuilding(input: {
    leaseSeconds: number;
    maxAttempts: number;
    now: Date;
  }): Promise<ClaimedCollectionExport | null>;
  /**
   * Documents belonging to one frozen submission, in stable field order.
   *
   * Read one submission at a time so the worker never holds a whole group's
   * file list, let alone its bytes.
   */
  listExportDocuments(submissionId: string): Promise<CollectionExportDocument[]>;
  /**
   * Marks an export ready. The lease must still be held, so a worker whose
   * claim lapsed and was retried elsewhere cannot overwrite the newer result.
   */
  completeExport(input: {
    byteSize: number;
    exportId: string;
    expiresAt: Date;
    leaseId: string;
    now: Date;
    storageKey: string;
  }): Promise<boolean>;
  /**
   * Records a failed attempt. Below the retry limit the job returns to
   * `pending`; at it the job fails for good so the Instructor sees retry
   * rather than an export that never resolves.
   */
  failExportAttempt(input: {
    errorCode: string;
    exportId: string;
    leaseId: string;
    maxAttempts: number;
    now: Date;
  }): Promise<boolean>;
  /**
   * One ready export whose expiry has passed, claimed for cleanup.
   *
   * Cleanup deletes the generated artifact only. Source submissions and their
   * documents are never touched by this path.
   */
  claimExpiredExport(input: { now: Date }): Promise<{ id: string; storageKey: string } | null>;
  /** Marks an expired export's artifact gone once storage has confirmed it. */
  markExportExpired(input: { exportId: string; now: Date }): Promise<void>;
  setRoundStatus(input: {
    actorAccountId: string;
    expectedStatus: 'active' | 'closed';
    nextStatus: 'active' | 'closed';
    now: Date;
    reason: string;
    roundId: string;
  }): Promise<{ pendingWork: RoundPendingWork } | 'not_found' | 'already_in_state'>;
  /**
   * Every retained version of one Student's response to one form.
   *
   * `actorAccountId` scopes a Student to their own history; an Instructor may
   * read any assigned Student's submitted versions, never their drafts.
   */
  getSubmissionHistory(input: {
    actorAccountId: string;
    formId: string;
    isInstructor: boolean;
    studentAccountId: string;
  }): Promise<CollectionSubmissionHistory | null>;
  saveDraft(input: {
    answers: CollectionAnswers;
    expectedVersion: number;
    formId: string;
    now: Date;
    studentAccountId: string;
  }): Promise<{ version: number } | 'forbidden' | 'stale'>;
  submit(input: {
    formId: string;
    idempotencyKey: string;
    now: Date;
    studentAccountId: string;
  }): Promise<
    | { submissionId: string; version: number }
    | { outcome: 'invalid'; code: string; fieldId: string | null }
    | 'forbidden'
    | 'missing_draft'
  >;
  updateFormStructure(input: {
    actorAccountId: string;
    expectedVersion: number;
    fields: CollectionField[];
    formId: string;
    now: Date;
  }): Promise<
    | CollectionForm
    | { outcome: 'invalid_transition'; code: string; fieldId: string }
    | 'not_found'
    | 'round_closed'
    | 'stale'
  >;
  /** Metadata edits permitted after opening; structural changes are rejected earlier. */
  updateFormMetadata(input: {
    actorAccountId: string;
    deadlineAt: Date | null;
    description: string;
    formId: string;
    now: Date;
    title: string;
  }): Promise<CollectionForm | 'deadline_earlier' | 'not_found' | 'round_closed'>;
  updateTemplate(input: {
    description: string;
    fields: CollectionField[];
    name: string;
    now: Date;
    templateId: string;
  }): Promise<CollectionFormTemplate | null>;
}
