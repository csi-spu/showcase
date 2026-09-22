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
import {
  COLLECTION_FILE_INSPECTOR,
  COLLECTION_FILE_STORAGE,
  COLLECTION_FORMS_REPOSITORY,
  CollectionFormsError,
} from './collection-forms.ports';
import type {
  CollectionFileInspector,
  CollectionFileStorage,
  CollectionFormsRepository,
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
  async updateDraftForm(input: {
    actorAccountId: string;
    deadlineAt: string | null;
    description: string;
    fields: CollectionField[];
    formId: string;
    title: string;
  }) {
    const { description, title } = this.validateMetadata(input.title, input.description);
    this.validateFields(input.fields);
    const result = await this.repository.updateDraftForm({
      actorAccountId: input.actorAccountId,
      deadlineAt: this.parseDeadline(input.deadlineAt),
      description,
      fields: input.fields,
      formId: input.formId,
      now: this.clock.now(),
      title,
    });
    if (result === 'not_found') throw new CollectionFormsError('FORM_NOT_FOUND', 404);
    if (result === 'round_closed') throw new CollectionFormsError('ROUND_CLOSED', 409);
    /*
     * Structure locks when the form opens. Editing it afterwards is not a
     * validation problem but a lifecycle one, so it gets its own code and the UI
     * explains that a copied form is the way to change questions.
     */
    if (result === 'not_draft') throw new CollectionFormsError('FORM_STRUCTURE_LOCKED', 409);
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

  async listStudentObligations(studentAccountId: string) {
    return this.repository.listStudentObligations(studentAccountId);
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

    const result = await this.repository.saveDraft({ ...input, now: this.clock.now() });
    if (result === 'forbidden') throw new CollectionFormsError('FORM_NOT_EDITABLE', 409);
    if (result === 'stale') throw new CollectionFormsError('DRAFT_STALE', 409);
    return result;
  }

  /**
   * Registers an upload slot after checking the request against the field's
   * configuration. The returned file stays quarantined: nothing here makes it
   * usable, and submission will refuse it until an inspection records a result.
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

    const existing = await this.repository.listFieldFiles({
      fieldId: input.fieldId,
      formId: input.formId,
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
    const file = await this.repository.createUpload({
      byteSize: input.byteSize,
      declaredContentType: input.declaredContentType,
      fieldId: input.fieldId,
      filename: input.filename.trim(),
      formId: input.formId,
      now: this.clock.now(),
      storageKey,
      studentAccountId: input.studentAccountId,
    });

    /*
     * The browser sends bytes straight to storage with this URL, so Core never
     * proxies the upload. It is short-lived and scoped to this one key; the row
     * it belongs to is already quarantined, so a successful PUT still produces
     * nothing the Student can submit until inspection has run.
     */
    const uploadUrl = await this.storage.createPresignedPut({
      contentType: input.declaredContentType,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      key: storageKey,
    });
    return { file, uploadUrl };
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
