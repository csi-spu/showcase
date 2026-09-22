import type { CollectionAnswers, CollectionField } from './collection-field';
import type { CollectionFile, CollectionFileStatus } from './collection-files';
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
  form: CollectionForm;
  /** Why the latest checking returned the submission, shown so the Student can act on it. */
  latestCheckingReason: string | null;
  latestSubmission: {
    answers: CollectionAnswers;
    files: DraftFileSelection;
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
  latestCheckingReason: string | null;
  /** Null until the Student submits, which is what `not_submitted` means. */
  latestSubmission: {
    answers: CollectionAnswers;
    files: DraftFileSelection;
    id: string;
    submittedAt: Date;
    version: number;
  } | null;
  /** Read-only identity from the Student Roster. Never a Student ID. */
  rosterName: { firstNameTh: string; lastNameTh: string };
  status: 'awaiting_checking' | 'changes_required' | 'not_submitted' | 'passed' | 'withdrawn';
  studentAccountId: string;
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
  listStudentObligations(studentAccountId: string): Promise<StudentObligation[]>;
  listTemplates(): Promise<CollectionFormTemplate[]>;
  openForm(input: {
    actorAccountId: string;
    formId: string;
    now: Date;
  }): Promise<CollectionForm | 'not_found' | 'not_draft' | 'round_closed'>;
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
  updateDraftForm(input: {
    actorAccountId: string;
    deadlineAt: Date | null;
    description: string;
    fields: CollectionField[];
    formId: string;
    now: Date;
    title: string;
  }): Promise<CollectionForm | 'not_draft' | 'not_found' | 'round_closed'>;
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
