import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_CLOCK } from '../../auth/application/auth.ports';
import type { Clock } from '../../auth/application/auth.ports';
import {
  MAX_FILE_BYTES,
  findAnswerError,
  findFieldDefinitionError,
  type CollectionAnswers,
  type CollectionField,
} from './collection-field';
import { findUploadRequestError, sanitizeDownloadFilename } from './collection-files';
import { findCloseReasonError, summarizePendingWork } from './collection-lifecycle';
import { boundMatrixLimit } from './collection-matrix';
import { buildExportArchive, buildExportWorkbook } from './collection-export-builder';
import {
  EXPORT_CONTENT_TYPES,
  EXPORT_DOWNLOAD_URL_SECONDS,
  EXPORT_LEASE_SECONDS,
  MAX_EXPORT_ATTEMPTS,
  MAX_EXPORT_FORMS,
  MAX_EXPORT_LIST,
  MAX_EXPORT_STUDENTS,
  CollectionExportTooLargeError,
  isExportDownloadable,
  toExportErrorCode,
  toExportExpiry,
  toExportStorageKey,
  type CollectionExportKind,
} from './collection-exports';
import { MAX_NOTIFICATION_FEED, MAX_REMINDER_BATCH } from './collection-notifications';
import {
  COLLECTION_FILE_INSPECTOR,
  COLLECTION_FILE_STORAGE,
  COLLECTION_FORMS_REPOSITORY,
  CollectionFormsError,
} from './collection-forms.ports';
import type {
  CollectionExportJob,
  CollectionFileInspector,
  CollectionFileStorage,
  CollectionFormsRepository,
  PendingNotification,
} from './collection-forms.ports';
import { resolvePrefills, type ResolvedPrefill } from './reusable-values';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5_000;

/* Long enough to send a 10 MB file on a slow connection, short enough to expire. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
/* A download starts immediately, so the URL does not need to outlive the click. */
const DOWNLOAD_URL_TTL_SECONDS = 60;

@Injectable()
export class CollectionFormsService {
  constructor(
    @Inject(COLLECTION_FORMS_REPOSITORY) private readonly repository: CollectionFormsRepository,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(COLLECTION_FILE_STORAGE) private readonly storage: CollectionFileStorage,
    @Inject(COLLECTION_FILE_INSPECTOR) private readonly inspector: CollectionFileInspector,
  ) {}

  async createForm(input: {
    actorAccountId: string;
    createdFromTemplateId?: string | null;
    deadlineAt: string | null;
    description: string;
    fields: CollectionField[];
    groupId: string;
    title: string;
  }) {
    const { description, title } = this.validateMetadata(input.title, input.description);
    this.validateFields(input.fields);
    const form = await this.repository.createForm({
      actorAccountId: input.actorAccountId,
      createdFromTemplateId: input.createdFromTemplateId ?? null,
      deadlineAt: this.parseDeadline(input.deadlineAt),
      description,
      fields: input.fields,
      groupId: input.groupId,
      now: this.clock.now(),
      title,
    });
    if (form === null) throw new CollectionFormsError('GROUP_NOT_FOUND', 404);
    return form;
  }

  /**
   * Replaces a Draft form's definition wholesale. The builder keeps its working
   * copy in the browser and saves once, so there is no partial-update path here.
   */
  async updateFormStructure(input: {
    actorAccountId: string;
    expectedVersion: number;
    fields: CollectionField[];
    formId: string;
  }) {
    this.validateFields(input.fields);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new CollectionFormsError('FORM_VERSION_INVALID', 422);
    }
    const result = await this.repository.updateFormStructure({
      actorAccountId: input.actorAccountId,
      expectedVersion: input.expectedVersion,
      fields: input.fields,
      formId: input.formId,
      now: this.clock.now(),
    });
    if (result === 'not_found') throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    if (result === 'round_closed') throw new CollectionFormsError('ROUND_CLOSED', 409);
    if (result === 'stale') throw new CollectionFormsError('FORM_STALE', 409);
    if ('outcome' in result) {
      throw new CollectionFormsError(result.code, 422, result.fieldId);
    }
    return result;
  }

  async updateFormMetadata(input: {
    actorAccountId: string;
    deadlineAt: string | null;
    description: string;
    formId: string;
    title: string;
  }) {
    const { description, title } = this.validateMetadata(input.title, input.description);
    const result = await this.repository.updateFormMetadata({
      actorAccountId: input.actorAccountId,
      deadlineAt: this.parseDeadline(input.deadlineAt),
      description,
      formId: input.formId,
      now: this.clock.now(),
      title,
    });
    if (result === 'not_found') throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    if (result === 'round_closed') throw new CollectionFormsError('ROUND_CLOSED', 409);
    if (result === 'deadline_earlier') {
      throw new CollectionFormsError('DEADLINE_NOT_EXTENDABLE', 409);
    }
    return result;
  }

  listGroupForms(groupId: string) {
    return this.repository.listGroupForms(groupId);
  }

  listTemplates() {
    return this.repository.listTemplates();
  }

  async createTemplate(input: {
    actorAccountId: string;
    description: string;
    fields: CollectionField[];
    name: string;
  }) {
    const { description, title: name } = this.validateMetadata(input.name, input.description);
    this.validateFields(input.fields);
    return this.repository.createTemplate({
      actorAccountId: input.actorAccountId,
      description,
      fields: input.fields,
      name,
      now: this.clock.now(),
    });
  }

  async updateTemplate(input: {
    description: string;
    fields: CollectionField[];
    name: string;
    templateId: string;
  }) {
    const { description, title: name } = this.validateMetadata(input.name, input.description);
    this.validateFields(input.fields);
    const template = await this.repository.updateTemplate({
      description,
      fields: input.fields,
      name,
      now: this.clock.now(),
      templateId: input.templateId,
    });
    if (template === null) throw new CollectionFormsError('TEMPLATE_NOT_FOUND', 404);
    return template;
  }

  /**
   * Copies a template's fields into a new Draft form.
   *
   * The copy is independent by construction: the fields are read once and written
   * to the form, so a later template edit cannot reach it. Membership, answers,
   * and the deadline are deliberately not copied.
   */
  async createFormFromTemplate(input: {
    actorAccountId: string;
    groupId: string;
    templateId: string;
    title?: string;
  }) {
    const template = await this.repository.getTemplate(input.templateId);
    if (template === null) throw new CollectionFormsError('TEMPLATE_NOT_FOUND', 404);
    return this.createForm({
      actorAccountId: input.actorAccountId,
      createdFromTemplateId: template.id,
      deadlineAt: null,
      description: template.description,
      fields: template.fields,
      groupId: input.groupId,
      title:
        input.title?.trim() === undefined || input.title.trim() === ''
          ? template.name
          : input.title.trim(),
    });
  }

  /** Saves a template directly from an existing form's current definition. */
  async saveFormAsTemplate(input: { actorAccountId: string; formId: string; name: string }) {
    const form = await this.repository.getForm(input.formId);
    if (form === null) throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    return this.createTemplate({
      actorAccountId: input.actorAccountId,
      description: form.description,
      fields: form.fields,
      name: input.name,
    });
  }

  async openForm(actorAccountId: string, formId: string) {
    const result = await this.repository.openForm({
      actorAccountId,
      formId,
      now: this.clock.now(),
    });
    if (result === 'not_found') throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    if (result === 'not_draft') throw new CollectionFormsError('FORM_ALREADY_OPENED', 409);
    if (result === 'round_closed') throw new CollectionFormsError('ROUND_CLOSED', 409);
    return result;
  }

  /**
   * Stops first submissions without ending the form.
   *
   * A closed form still accepts requested corrections and still allows checking,
   * which is the whole point of closing it separately from the round: the
   * Instructor stops new arrivals and works through what is already in.
   */
  async closeForm(input: { actorAccountId: string; formId: string; reason: string }) {
    const reason = this.requireReason(input.reason);
    const result = await this.repository.closeForm({
      actorAccountId: input.actorAccountId,
      formId: input.formId,
      now: this.clock.now(),
      reason,
    });
    if (result === 'not_found') throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    if (result === 'round_closed') throw new CollectionFormsError('ROUND_CLOSED', 409);
    if (result === 'not_open') throw new CollectionFormsError('FORM_NOT_OPEN', 409);
    return result;
  }

  /**
   * How many obligations a reopen would create, shown before confirming.
   *
   * Reopening is not a request for everyone to submit again: only current
   * members who never received an obligation get one, so the count is the
   * honest measure of who this puts to work.
   */
  async previewFormReopen(formId: string) {
    const result = await this.repository.previewFormReopen(formId);
    if (result === 'not_found') throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    if (result === 'not_closed') throw new CollectionFormsError('FORM_NOT_CLOSED', 409);
    return result;
  }

  async reopenForm(input: { actorAccountId: string; formId: string; reason: string }) {
    const reason = this.requireReason(input.reason);
    const result = await this.repository.reopenForm({
      actorAccountId: input.actorAccountId,
      formId: input.formId,
      now: this.clock.now(),
      reason,
    });
    if (result === 'not_found') throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    if (result === 'round_closed') throw new CollectionFormsError('ROUND_CLOSED', 409);
    if (result === 'not_closed') throw new CollectionFormsError('FORM_NOT_CLOSED', 409);
    return result;
  }

  /**
   * One bounded page of the group's Student-by-form matrix.
   *
   * The page is cut in the database, not the browser: a group may hold far more
   * members than a screen, and downloading all of them to count them is exactly
   * what the specification rules out.
   */
  async readGroupMatrix(input: {
    afterStudentAccountId: string | null;
    groupId: string;
    limit: number | undefined;
  }) {
    const page = await this.repository.readGroupMatrix({
      afterStudentAccountId: input.afterStudentAccountId,
      groupId: input.groupId,
      limit: boundMatrixLimit(input.limit),
    });
    if (page === null) throw new CollectionFormsError('GROUP_NOT_FOUND', 404);
    return page;
  }

  /**
   * Delivers one bounded batch of due deadline reminders.
   *
   * Returns how many were recorded, so a worker can drain the queue and back
   * off when it empties. Reminders are derived from the obligation rather than
   * scheduled ahead, so a moved deadline or a closed round needs no backfill:
   * the next query simply stops selecting the row.
   */
  async dispatchDueReminders(): Promise<number> {
    const now = this.clock.now();
    const due = await this.repository.findDueReminders({ limit: MAX_REMINDER_BATCH, now });
    if (due.length === 0) return 0;
    return this.repository.recordNotifications({ notifications: due, now });
  }

  /**
   * Announces an event to the Students it concerns.
   *
   * Eligibility is not decided here. The repository rechecks the round and the
   * membership inside the write, so a notification queued before a round closed
   * is suppressed rather than delivered.
   */
  async notify(notifications: PendingNotification[]): Promise<number> {
    if (notifications.length === 0) return 0;
    return this.repository.recordNotifications({ notifications, now: this.clock.now() });
  }

  /** One Student's own notifications. Scoped to them by the query, not by a filter here. */
  async readNotificationFeed(studentAccountId: string) {
    return this.repository.readNotificationFeed({
      limit: MAX_NOTIFICATION_FEED,
      studentAccountId,
    });
  }

  async markNotificationsRead(input: { notificationIds: string[]; studentAccountId: string }) {
    if (input.notificationIds.length > MAX_NOTIFICATION_FEED) {
      throw new CollectionFormsError('NOTIFICATION_BATCH_TOO_LARGE', 422);
    }
    const readCount = await this.repository.markNotificationsRead({
      notificationIds: input.notificationIds,
      now: this.clock.now(),
      studentAccountId: input.studentAccountId,
    });
    return { readCount };
  }

  /**
   * Requests an export and freezes its snapshot.
   *
   * Returns immediately with a pending job: building is the worker's work, and
   * an Instructor waiting on an HTTP request for a group archive is exactly the
   * shape the specification rules out.
   */
  async createExport(input: {
    formIds: string[];
    groupId: string;
    kind: CollectionExportKind;
    requestedByAccountId: string;
  }) {
    if (input.formIds.length === 0) throw new CollectionFormsError('EXPORT_FORMS_REQUIRED', 422);
    if (input.formIds.length > MAX_EXPORT_FORMS) {
      throw new CollectionFormsError('EXPORT_FORM_COUNT_EXCEEDED', 422);
    }
    let job: CollectionExportJob | null;
    try {
      job = await this.repository.createExport({
        formIds: input.formIds,
        groupId: input.groupId,
        kind: input.kind,
        maxForms: MAX_EXPORT_FORMS,
        maxStudents: MAX_EXPORT_STUDENTS,
        now: this.clock.now(),
        requestedByAccountId: input.requestedByAccountId,
      });
    } catch (error: unknown) {
      /*
       * The snapshot exceeded the scope limit and was rolled back. Refused
       * rather than truncated: a tracking sheet missing Students silently is
       * worse than one the Instructor has to narrow.
       */
      if (error instanceof CollectionExportTooLargeError) {
        throw new CollectionFormsError('EXPORT_SCOPE_TOO_LARGE', 422);
      }
      throw error;
    }
    if (job === null) throw new CollectionFormsError('EXPORT_SCOPE_EMPTY', 404);
    return job;
  }

  async listGroupExports(groupId: string) {
    return this.repository.listGroupExports({ groupId, limit: MAX_EXPORT_LIST });
  }

  async getExport(exportId: string) {
    const job = await this.repository.getExport(exportId);
    if (job === null) throw new CollectionFormsError('EXPORT_NOT_FOUND', 404);
    return job;
  }

  /**
   * Issues a download URL for a ready artifact.
   *
   * Authorization is the caller's responsibility at the transport guard and is
   * rechecked here against the *current* actor, not the one recorded on the
   * job: an Instructor whose role was withdrawn after requesting an export must
   * not be able to collect it. Expiry is decided from the recorded instant, so
   * a cleanup sweep that has not run yet never extends an artifact's life.
   */
  async createExportDownload(input: { exportId: string }) {
    const job = await this.repository.getExport(input.exportId);
    if (job === null) throw new CollectionFormsError('EXPORT_NOT_FOUND', 404);
    if (job.status === 'failed') throw new CollectionFormsError('EXPORT_FAILED', 409);
    if (
      !isExportDownloadable({ expiresAt: job.expiresAt, now: this.clock.now(), status: job.status })
    ) {
      throw new CollectionFormsError(
        job.status === 'ready' || job.status === 'expired' ? 'EXPORT_EXPIRED' : 'EXPORT_NOT_READY',
        409,
      );
    }
    const downloadUrl = await this.storage.createPresignedGet({
      expiresInSeconds: EXPORT_DOWNLOAD_URL_SECONDS,
      key: toExportStorageKey(job.id, job.kind),
    });
    return {
      contentType: EXPORT_CONTENT_TYPES[job.kind],
      downloadUrl,
      filename: `collection-export-${job.id}.${job.kind === 'excel' ? 'xlsx' : 'zip'}`,
    };
  }

  /**
   * Builds the next pending export, if there is one.
   *
   * Returns false when the queue is empty so a worker can back off. A failure
   * is recorded against the attempt rather than thrown, because the job must
   * either retry from the same snapshot or surface retry to the Instructor —
   * never vanish.
   */
  async buildNextExport(): Promise<boolean> {
    const now = this.clock.now();
    const claimed = await this.repository.claimExportForBuilding({
      leaseSeconds: EXPORT_LEASE_SECONDS,
      maxAttempts: MAX_EXPORT_ATTEMPTS,
      now,
    });
    if (claimed === null) return false;

    const sources = {
      listDocuments: (submissionId: string) => this.repository.listExportDocuments(submissionId),
      readAnswers: (submissionId: string) => this.repository.readSubmissionAnswers(submissionId),
      readDocument: (storageKey: string) => this.storage.getObjectStream(storageKey),
    };
    const snapshot = { entries: claimed.entries, forms: claimed.forms };
    const storageKey = toExportStorageKey(claimed.id, claimed.kind);

    try {
      /*
       * Streamed straight into storage as it is generated, so neither the
       * workbook nor the archive is ever held whole in this process.
       */
      const byteSize = await this.storage.putObjectStream({
        body:
          claimed.kind === 'excel'
            ? buildExportWorkbook(snapshot, sources)
            : buildExportArchive(snapshot, sources),
        contentType: EXPORT_CONTENT_TYPES[claimed.kind],
        key: storageKey,
      });
      const readyAt = this.clock.now();
      await this.repository.completeExport({
        byteSize,
        expiresAt: toExportExpiry(readyAt),
        exportId: claimed.id,
        leaseId: claimed.leaseId,
        now: readyAt,
        storageKey,
      });
      return true;
    } catch (error: unknown) {
      /*
       * The partial object is removed before the attempt is recorded, so a
       * failed build can never leave bytes that a later download would serve
       * as a complete archive. A delete that itself fails is not allowed to
       * hide the original failure.
       */
      try {
        await this.storage.deleteObject(storageKey);
      } catch {
        /* Cleanup is best effort; the job is failed either way. */
      }
      await this.repository.failExportAttempt({
        errorCode: toExportErrorCode(error),
        exportId: claimed.id,
        leaseId: claimed.leaseId,
        maxAttempts: MAX_EXPORT_ATTEMPTS,
        now: this.clock.now(),
      });
      return true;
    }
  }

  /**
   * Deletes one expired artifact.
   *
   * Only the generated file: the snapshot rows and every source submission and
   * document stay. A storage failure leaves the row claimable on a later pass
   * rather than marking it gone, so cleanup is retryable and never lies about
   * what it removed.
   */
  async cleanUpExpiredExport(): Promise<boolean> {
    const now = this.clock.now();
    const expired = await this.repository.claimExpiredExport({ now });
    if (expired === null) return false;
    await this.storage.deleteObject(expired.storageKey);
    await this.repository.markExportExpired({ exportId: expired.id, now: this.clock.now() });
    return true;
  }

  /** Outstanding work an Instructor must see before closing a round. */
  async getRoundPendingWork(roundId: string) {
    const counts = await this.repository.getRoundPendingWork(roundId);
    if (counts === null) throw new CollectionFormsError('ROUND_NOT_FOUND', 404);
    return summarizePendingWork(counts);
  }

  /**
   * Closes a round read-only.
   *
   * Pending work does not block this -- the Instructor confirms against the
   * counts and decides -- but the counts at the moment of the decision are
   * retained with the audit, because they cannot be reconstructed afterwards.
   * Closure never converts unfinished work into passed work.
   */
  async closeRound(input: { actorAccountId: string; reason: string; roundId: string }) {
    return this.changeRoundStatus({ ...input, expectedStatus: 'active', nextStatus: 'closed' });
  }

  async reopenRound(input: { actorAccountId: string; reason: string; roundId: string }) {
    return this.changeRoundStatus({ ...input, expectedStatus: 'closed', nextStatus: 'active' });
  }

  private async changeRoundStatus(input: {
    actorAccountId: string;
    expectedStatus: 'active' | 'closed';
    nextStatus: 'active' | 'closed';
    reason: string;
    roundId: string;
  }) {
    const reason = this.requireReason(input.reason);
    const result = await this.repository.setRoundStatus({
      actorAccountId: input.actorAccountId,
      expectedStatus: input.expectedStatus,
      nextStatus: input.nextStatus,
      now: this.clock.now(),
      reason,
      roundId: input.roundId,
    });
    if (result === 'not_found') throw new CollectionFormsError('ROUND_NOT_FOUND', 404);
    if (result === 'already_in_state') {
      throw new CollectionFormsError(
        input.nextStatus === 'closed' ? 'ROUND_ALREADY_CLOSED' : 'ROUND_ALREADY_ACTIVE',
        409,
      );
    }
    return { pendingWork: summarizePendingWork(result.pendingWork) };
  }

  /**
   * Every retained version of one response, with the decisions against each.
   *
   * Authorization is the repository query, so an unauthorized read and a
   * missing one are the same 404 here: telling them apart would confirm that
   * another Student has an obligation on this form.
   */
  async getSubmissionHistory(input: {
    actorAccountId: string;
    formId: string;
    isInstructor: boolean;
    studentAccountId: string;
  }) {
    const history = await this.repository.getSubmissionHistory(input);
    if (history === null) throw new CollectionFormsError('OBLIGATION_NOT_FOUND', 404);
    return history;
  }

  async listStudentObligations(studentAccountId: string) {
    return this.repository.listStudentObligations(studentAccountId, this.clock.now());
  }

  /**
   * The review queue for one form: who was assigned it and what they submitted.
   *
   * Any Instructor may review any form, which is the same rule `checkSubmission`
   * and `openForm` already apply. Draft answers are not part of this view.
   */
  async listFormSubmissions(formId: string) {
    const result = await this.repository.listFormSubmissions(formId);
    if (result === null) throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    return result;
  }

  /**
   * Values the system can fill in for this Student on this form.
   *
   * Returned separately from the obligation so the Student sees which values were
   * prefilled and can change any of them before submitting.
   */
  async listPrefills(input: {
    formId: string;
    studentAccountId: string;
  }): Promise<ResolvedPrefill[]> {
    const form = await this.repository.getForm(input.formId);
    if (form === null) throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    const hasMappedField = form.fields.some((field) => field.mappingKey !== undefined);
    if (!hasMappedField) return [];
    const candidates = await this.repository.listReusableValues({
      excludeFormId: form.id,
      groupId: form.groupId,
      studentAccountId: input.studentAccountId,
    });
    return resolvePrefills(form.fields, candidates);
  }

  async saveDraft(input: {
    answers: CollectionAnswers;
    expectedVersion: number;
    formId: string;
    studentAccountId: string;
  }) {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new CollectionFormsError('DRAFT_VERSION_INVALID', 422);
    }
    const form = await this.repository.getForm(input.formId);
    if (form === null) throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    /*
     * A draft is validated for shape but not for completeness: the Student is
     * mid-answer, and autosave must never reject work in progress.
     */
    const error = findAnswerError(form.fields, input.answers, { isComplete: false });
    if (error !== null) throw new CollectionFormsError(error.code, 422, error.fieldId);

    const result = await this.repository.saveDraft({
      ...input,
      now: this.clock.now(),
    });
    if (result === 'forbidden') throw new CollectionFormsError('FORM_NOT_EDITABLE', 409);
    if (result === 'stale') throw new CollectionFormsError('DRAFT_STALE', 409);
    return result;
  }

  /**
   * Registers a pending upload slot after checking the request against the
   * field's configuration. It does not enter quarantine until the browser
   * confirms that its signed PUT completed.
   */
  async createUpload(input: {
    byteSize: number;
    declaredContentType: string;
    fieldId: string;
    filename: string;
    formId: string;
    studentAccountId: string;
  }) {
    const form = await this.repository.getForm(input.formId);
    if (form === null) throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    const field = form.fields.find((candidate) => candidate.id === input.fieldId);
    if (field === undefined) throw new CollectionFormsError('FIELD_NOT_FOUND', 404);

    const now = this.clock.now();
    const existing = await this.repository.listFieldFiles({
      fieldId: input.fieldId,
      formId: input.formId,
      now,
      studentAccountId: input.studentAccountId,
    });
    const error = findUploadRequestError(
      field,
      {
        byteSize: input.byteSize,
        declaredContentType: input.declaredContentType,
        filename: input.filename,
      },
      existing.length,
    );
    if (error !== null) throw new CollectionFormsError(error, 422, input.fieldId);

    // Opaque and random: never derived from a Student ID or a filename.
    const storageKey = `collection-files/${randomUUID()}`;
    /*
     * Sign before persisting the slot. If storage is unavailable, no row is
     * left behind to consume the field's upload limit without usable bytes.
     */
    const uploadUrl = await this.storage.createPresignedPut({
      contentType: input.declaredContentType,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      key: storageKey,
    });
    const file = await this.repository.createUpload({
      byteSize: input.byteSize,
      declaredContentType: input.declaredContentType,
      fieldId: input.fieldId,
      filename: input.filename.trim(),
      formId: input.formId,
      now,
      storageKey,
      studentAccountId: input.studentAccountId,
    });

    /*
     * The browser sends bytes straight to storage with this URL, so Core never
     * proxies the upload. It is short-lived and scoped to this one key; the row
     * it belongs to remains pending until finalizeUpload moves it into the
     * inspection queue. A successful PUT alone is never an accepted document.
     */
    return { file, uploadUrl };
  }

  async finalizeUpload(input: { fileId: string; formId: string; studentAccountId: string }) {
    const result = await this.repository.finalizeUpload(input);
    if (result === 'not_found') throw new CollectionFormsError('FILE_NOT_FOUND', 404);
  }

  /**
   * Inspects one waiting file and records the verdict.
   *
   * Returns whether a file was processed, so a caller can drain the queue. Any
   * failure to read or inspect the bytes is recorded as a failed inspection
   * rather than swallowed: a file must not sit in `inspecting` forever, and it
   * must never become `ready` by accident.
   */
  async inspectNextFile(): Promise<boolean> {
    const claimed = await this.repository.claimFileForInspection();
    if (claimed === null) return false;

    let result: {
      detectedContentType: string | null;
      errorCode: string | null;
      isAccepted: boolean;
    };
    try {
      const bytes = await this.storage.getObject(claimed.storageKey, MAX_FILE_BYTES);
      result = await this.inspector.inspect({
        bytes,
        declaredContentType: claimed.declaredContentType,
        filename: claimed.originalFilename,
      });
    } catch {
      /*
       * The bytes could not be read or inspected. The file fails: an
       * uninspected file is not a safe file, and pretending otherwise is the
       * one outcome this lifecycle exists to prevent.
       */
      result = {
        detectedContentType: null,
        errorCode: 'FILE_INSPECTION_UNAVAILABLE',
        isAccepted: false,
      };
    }

    await this.repository.completeInspection({
      detectedContentType: result.detectedContentType,
      errorCode: result.errorCode,
      fileId: claimed.id,
      isAccepted: result.isAccepted,
      leaseId: claimed.leaseId,
      now: this.clock.now(),
    });
    return true;
  }

  /**
   * Issues a short-lived signed URL for one file the caller may read.
   *
   * There is no public URL for collection documents. Authorization happens in
   * the repository query, and a file that has not passed inspection is not
   * downloadable, so unchecked bytes are never handed back as a document.
   */
  async createDownload(input: { actorAccountId: string; fileId: string; isInstructor: boolean }) {
    const file = await this.repository.findReadableFile(input);
    if (file === null) throw new CollectionFormsError('FILE_NOT_FOUND', 404);
    if (file.status !== 'ready') throw new CollectionFormsError('FILE_NOT_READY', 409);

    const downloadUrl = await this.storage.createPresignedGet({
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
      key: file.storageKey,
    });
    return { downloadUrl, filename: sanitizeDownloadFilename(file.originalFilename) };
  }

  async attachDraftFile(input: {
    fieldId: string;
    fileId: string;
    formId: string;
    studentAccountId: string;
  }) {
    const result = await this.repository.attachDraftFile(input);
    if (result === 'not_found') throw new CollectionFormsError('FILE_NOT_FOUND', 404);
    if (result === 'forbidden') throw new CollectionFormsError('FILE_NOT_ACCESSIBLE', 403);
    if (result === 'too_many') {
      throw new CollectionFormsError('FILE_COUNT_EXCEEDED', 422, input.fieldId);
    }
  }

  async detachDraftFile(input: { fileId: string; formId: string; studentAccountId: string }) {
    const result = await this.repository.detachDraftFile(input);
    if (result === 'not_found') throw new CollectionFormsError('FILE_NOT_FOUND', 404);
  }

  async submit(formId: string, studentAccountId: string, idempotencyKey: string) {
    const result = await this.repository.submit({
      formId,
      idempotencyKey,
      now: this.clock.now(),
      studentAccountId,
    });
    if (result === 'forbidden') throw new CollectionFormsError('FORM_NOT_SUBMITTABLE', 409);
    if (result === 'missing_draft') throw new CollectionFormsError('DRAFT_REQUIRED', 422);
    if ('outcome' in result) {
      throw new CollectionFormsError(result.code, 422, result.fieldId);
    }
    return result;
  }

  async checkSubmission(input: {
    actorAccountId: string;
    decision: 'changes_required' | 'passed';
    expectedSubmissionId: string;
    reason: string | null;
  }) {
    const reason = input.reason?.trim() ?? null;
    if (
      input.decision === 'changes_required' &&
      (reason === null || reason.length === 0 || reason.length > 2_000)
    ) {
      throw new CollectionFormsError('CHECK_REASON_REQUIRED', 422);
    }
    const result = await this.repository.checkSubmission({
      ...input,
      now: this.clock.now(),
      reason,
    });
    if (result === 'not_found') throw new CollectionFormsError('SUBMISSION_NOT_FOUND', 404);
    if (result === 'round_closed') throw new CollectionFormsError('ROUND_CLOSED', 409);
    if (result === 'stale') throw new CollectionFormsError('SUBMISSION_STALE', 409);
  }

  /** Every lifecycle change carries a reason the next person can act on. */
  private requireReason(reason: string): string {
    const error = findCloseReasonError(reason);
    if (error !== null) throw new CollectionFormsError(error, 422);
    return reason.trim();
  }

  private validateMetadata(title: string, description: string) {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (
      trimmedTitle.length === 0 ||
      trimmedTitle.length > MAX_TITLE_LENGTH ||
      trimmedDescription.length > MAX_DESCRIPTION_LENGTH
    ) {
      throw new CollectionFormsError('FORM_INVALID', 422);
    }
    return { description: trimmedDescription, title: trimmedTitle };
  }

  private parseDeadline(value: string | null): Date | null {
    if (value === null) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new CollectionFormsError('FORM_INVALID', 422);
    return parsed;
  }

  private validateFields(fields: CollectionField[]): void {
    const error = findFieldDefinitionError(fields);
    if (error !== null) throw new CollectionFormsError(error.code, 422, error.fieldId);
  }
}
