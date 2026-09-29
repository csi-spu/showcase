import type { Clock } from '../../auth/application/auth.ports';
import type { CollectionField } from './collection-field';
import { CollectionFormsService } from './collection-forms.service';
import { CollectionFormsError } from './collection-forms.ports';
import { decodeFormHistoryCursor, encodeFormHistoryCursor } from './collection-form-history';
import {
  CollectionExportTooLargeError,
  EXPORT_CONTENT_TYPES,
  MAX_EXPORT_FORMS,
} from './collection-exports';
import { MAX_MATRIX_ROWS } from './collection-matrix';
import type {
  ClaimedCollectionExport,
  CollectionExportJob,
  CollectionFile,
  CollectionFileInspection,
  CollectionFileInspector,
  CollectionFileStorage,
  CollectionForm,
  CollectionFormTemplate,
  CollectionFormsRepository,
  CollectionReviewEntry,
} from './collection-forms.ports';
import type { ReusableValueCandidate } from './reusable-values';

const NOW = new Date('2026-09-22T10:00:00.000Z');
const ACTOR = '10000000-0000-4000-8000-000000000001';
const STUDENT = '20000000-0000-4000-8000-000000000001';

const TEXT_FIELD: CollectionField = {
  description: '',
  id: 'company',
  label: 'บริษัท',
  required: true,
  type: 'short_text',
};

const FORM: CollectionForm = {
  createdFromTemplateId: null,
  deadlineAt: null,
  description: '',
  fields: [TEXT_FIELD],
  groupId: '30000000-0000-4000-8000-000000000001',
  id: '40000000-0000-4000-8000-000000000001',
  status: 'draft',
  title: 'รายงาน',
  version: 1,
};

const TEMPLATE: CollectionFormTemplate = {
  createdAt: NOW,
  description: 'คำอธิบายแม่แบบ',
  fields: [TEXT_FIELD],
  id: '60000000-0000-4000-8000-000000000001',
  name: 'แม่แบบรายงาน',
  updatedAt: NOW,
  version: 1,
};

type Result<K extends keyof CollectionFormsRepository> = Awaited<
  ReturnType<CollectionFormsRepository[K]>
>;

class FakeRepository implements CollectionFormsRepository {
  attachResult: Result<'attachDraftFile'> = 'attached';
  checkResult: Result<'checkSubmission'> = 'checked';
  detachResult: Result<'detachDraftFile'> = 'detached';
  finalizeResult: Result<'finalizeUpload'> = 'finalized';
  form: CollectionForm | null = FORM;
  formSubmissions: { form: CollectionForm; entries: CollectionReviewEntry[] } | null = {
    entries: [],
    form: FORM,
  };
  metadataResult: Result<'updateFormMetadata'> = { ...FORM, title: 'ชื่อใหม่' };
  openResult: Result<'openForm'> = { ...FORM, status: 'open' };
  reusableValues: ReusableValueCandidate[] = [];
  saveResult: Result<'saveDraft'> = { version: 1 };
  saveFormResult: Result<'saveForm'> = { ...FORM, title: 'ชื่อใหม่', version: 2 };
  submitResult: Result<'submit'> = {
    submissionId: '50000000-0000-4000-8000-000000000001',
    version: 1,
  };
  template: CollectionFormTemplate | null = TEMPLATE;
  updateStructureResult: Result<'updateFormStructure'> = FORM;

  createdForms: Parameters<CollectionFormsRepository['createForm']>[0][] = [];
  savedForms: Parameters<CollectionFormsRepository['saveForm']>[0][] = [];
  createdTemplates: Parameters<CollectionFormsRepository['createTemplate']>[0][] = [];
  createdUploads: Parameters<CollectionFormsRepository['createUpload']>[0][] = [];
  isFormDeletedBeforeUpload = false;
  fieldFiles: CollectionFile[] = [];
  claimable: Result<'claimFileForInspection'> = null;
  completedInspections: Parameters<CollectionFormsRepository['completeInspection']>[0][] = [];
  readableFile: Result<'findReadableFile'> = null;
  retryUpload: Result<'findPendingUploadForRetry'> = {
    declaredContentType: 'application/pdf',
    storageKey: 'collection-files/existing',
  };

  closeResult: Result<'closeForm'> = { ...FORM, status: 'closed' };
  closedForms: Parameters<CollectionFormsRepository['closeForm']>[0][] = [];
  reopenPreview: Result<'previewFormReopen'> = { newlyAssignedCount: 2 };
  reopenResult: Result<'reopenForm'> = {
    form: { ...FORM, status: 'open' },
    newlyAssignedCount: 2,
  };
  reopenedForms: Parameters<CollectionFormsRepository['reopenForm']>[0][] = [];
  pendingWork: Result<'getRoundPendingWork'> = {
    awaitingChecking: 1,
    changesRequired: 2,
    notSubmitted: 3,
  };
  matrixPage: Result<'readGroupMatrix'> = {
    forms: [],
    nextCursor: null,
    rows: [],
    summary: {
      awaitingChecking: 0,
      changesRequired: 0,
      late: 0,
      notRequired: 0,
      notSubmitted: 0,
      passed: 0,
      withdrawn: 0,
    },
    totalMembers: 0,
  };
  matrixReads: Parameters<CollectionFormsRepository['readGroupMatrix']>[0][] = [];
  roundStatusChanges: Parameters<CollectionFormsRepository['setRoundStatus']>[0][] = [];
  roundStatusResult: Result<'setRoundStatus'> = {
    pendingWork: { awaitingChecking: 1, changesRequired: 2, notSubmitted: 3 },
  };
  history: Result<'getSubmissionHistory'> = null;
  formHistory: Result<'readFormHistory'> = { entries: [], hasMore: false };
  formHistoryReads: Parameters<CollectionFormsRepository['readFormHistory']>[0][] = [];

  attachDraftFile(): Promise<Result<'attachDraftFile'>> {
    return Promise.resolve(this.attachResult);
  }
  checkSubmission(): Promise<Result<'checkSubmission'>> {
    return Promise.resolve(this.checkResult);
  }
  createForm(input: Parameters<CollectionFormsRepository['createForm']>[0]) {
    this.createdForms.push(input);
    return Promise.resolve(
      this.form === null
        ? null
        : {
            ...this.form,
            description: input.description,
            fields: input.fields,
            title: input.title,
          },
    );
  }
  createTemplate(input: Parameters<CollectionFormsRepository['createTemplate']>[0]) {
    this.createdTemplates.push(input);
    return Promise.resolve({ ...TEMPLATE, fields: input.fields, name: input.name });
  }
  createUpload(input: Parameters<CollectionFormsRepository['createUpload']>[0]) {
    this.createdUploads.push(input);
    if (this.isFormDeletedBeforeUpload) return Promise.resolve(null);
    return Promise.resolve<CollectionFile>({
      byteSize: input.byteSize,
      createdAt: input.now,
      declaredContentType: input.declaredContentType,
      detectedContentType: null,
      fieldId: input.fieldId,
      formId: input.formId,
      id: '70000000-0000-4000-8000-000000000001',
      inspectionErrorCode: null,
      originalFilename: input.filename,
      status: 'pending_upload',
      studentAccountId: input.studentAccountId,
    });
  }
  detachDraftFile(): Promise<Result<'detachDraftFile'>> {
    return Promise.resolve(this.detachResult);
  }
  claimFileForInspection(): Promise<Result<'claimFileForInspection'>> {
    const claimed = this.claimable;
    this.claimable = null;
    return Promise.resolve(claimed);
  }
  completeInspection(input: Parameters<CollectionFormsRepository['completeInspection']>[0]) {
    this.completedInspections.push(input);
    return Promise.resolve();
  }
  findReadableFile(): Promise<Result<'findReadableFile'>> {
    return Promise.resolve(this.readableFile);
  }
  findPendingUploadForRetry(): Promise<Result<'findPendingUploadForRetry'>> {
    return Promise.resolve(this.retryUpload);
  }
  finalizeUpload(): Promise<Result<'finalizeUpload'>> {
    return Promise.resolve(this.finalizeResult);
  }
  getForm(): Promise<CollectionForm | null> {
    return Promise.resolve(this.form);
  }
  getTemplate(): Promise<CollectionFormTemplate | null> {
    return Promise.resolve(this.template);
  }
  listFieldFiles(input: Parameters<CollectionFormsRepository['listFieldFiles']>[0]) {
    return Promise.resolve(
      this.fieldFiles.filter(
        (file) =>
          file.status !== 'failed' &&
          (file.status !== 'pending_upload' ||
            file.createdAt.getTime() > input.now.getTime() - 15 * 60 * 1_000),
      ),
    );
  }
  listGroupForms(): Promise<CollectionForm[]> {
    return Promise.resolve(this.form === null ? [] : [this.form]);
  }
  listReusableValues(): Promise<ReusableValueCandidate[]> {
    return Promise.resolve(this.reusableValues);
  }
  listFormSubmissions(): Promise<{
    form: CollectionForm;
    entries: CollectionReviewEntry[];
  } | null> {
    return Promise.resolve(this.formSubmissions);
  }
  listStudentObligations(): Promise<[]> {
    return Promise.resolve([]);
  }
  listTemplates(): Promise<CollectionFormTemplate[]> {
    return Promise.resolve(this.template === null ? [] : [this.template]);
  }
  openForm(): Promise<Result<'openForm'>> {
    return Promise.resolve(this.openResult);
  }
  closeForm(input: Parameters<CollectionFormsRepository['closeForm']>[0]) {
    this.closedForms.push(input);
    return Promise.resolve(this.closeResult);
  }
  previewFormReopen(): Promise<Result<'previewFormReopen'>> {
    return Promise.resolve(this.reopenPreview);
  }
  reopenForm(input: Parameters<CollectionFormsRepository['reopenForm']>[0]) {
    this.reopenedForms.push(input);
    return Promise.resolve(this.reopenResult);
  }
  getRoundPendingWork(): Promise<Result<'getRoundPendingWork'>> {
    return Promise.resolve(this.pendingWork);
  }
  recordedNotifications: Parameters<CollectionFormsRepository['recordNotifications']>[0][] = [];
  dueReminders: Result<'findDueReminders'> = [];
  notificationFeed: Result<'readNotificationFeed'> = { notifications: [], unreadCount: 0 };
  notificationReads: Parameters<CollectionFormsRepository['markNotificationsRead']>[0][] = [];

  createdExports: Parameters<CollectionFormsRepository['createExport']>[0][] = [];
  createExportResult: Result<'createExport'> | Error = null;
  exportsById = new Map<string, NonNullable<Result<'getExport'>>>();
  groupExports: Result<'listGroupExports'> = [];
  claimedExport: Result<'claimExportForBuilding'> = null;
  completedExports: Parameters<CollectionFormsRepository['completeExport']>[0][] = [];
  failedExports: Parameters<CollectionFormsRepository['failExportAttempt']>[0][] = [];
  expiredClaim: Result<'claimExpiredExport'> = null;
  markedExpired: Parameters<CollectionFormsRepository['markExportExpired']>[0][] = [];
  exportDocuments = new Map<string, Result<'listExportDocuments'>>();
  submissionAnswers = new Map<string, NonNullable<Result<'readSubmissionAnswers'>>>();

  createExport(input: Parameters<CollectionFormsRepository['createExport']>[0]) {
    this.createdExports.push(input);
    if (this.createExportResult instanceof Error) return Promise.reject(this.createExportResult);
    return Promise.resolve(this.createExportResult);
  }
  getExport(exportId: string): Promise<Result<'getExport'>> {
    return Promise.resolve(this.exportsById.get(exportId) ?? null);
  }
  readSubmissionAnswers(submissionId: string): Promise<Result<'readSubmissionAnswers'>> {
    return Promise.resolve(this.submissionAnswers.get(submissionId) ?? null);
  }
  listGroupExports(): Promise<Result<'listGroupExports'>> {
    return Promise.resolve(this.groupExports);
  }
  claimExportForBuilding(): Promise<Result<'claimExportForBuilding'>> {
    const claimed = this.claimedExport;
    /* Claimed once, like the real lease: a second poll finds the queue empty. */
    this.claimedExport = null;
    return Promise.resolve(claimed);
  }
  listExportDocuments(submissionId: string): Promise<Result<'listExportDocuments'>> {
    return Promise.resolve(this.exportDocuments.get(submissionId) ?? []);
  }
  completeExport(input: Parameters<CollectionFormsRepository['completeExport']>[0]) {
    this.completedExports.push(input);
    return Promise.resolve(true);
  }
  failExportAttempt(input: Parameters<CollectionFormsRepository['failExportAttempt']>[0]) {
    this.failedExports.push(input);
    return Promise.resolve(true);
  }
  claimExpiredExport(): Promise<Result<'claimExpiredExport'>> {
    const claim = this.expiredClaim;
    this.expiredClaim = null;
    return Promise.resolve(claim);
  }
  markExportExpired(input: Parameters<CollectionFormsRepository['markExportExpired']>[0]) {
    this.markedExpired.push(input);
    return Promise.resolve();
  }

  recordNotifications(input: Parameters<CollectionFormsRepository['recordNotifications']>[0]) {
    this.recordedNotifications.push(input);
    return Promise.resolve(input.notifications.length);
  }
  findDueReminders(): Promise<Result<'findDueReminders'>> {
    return Promise.resolve(this.dueReminders);
  }
  readNotificationFeed(): Promise<Result<'readNotificationFeed'>> {
    return Promise.resolve(this.notificationFeed);
  }
  markNotificationsRead(input: Parameters<CollectionFormsRepository['markNotificationsRead']>[0]) {
    this.notificationReads.push(input);
    return Promise.resolve(input.notificationIds.length);
  }
  readGroupMatrix(input: Parameters<CollectionFormsRepository['readGroupMatrix']>[0]) {
    this.matrixReads.push(input);
    return Promise.resolve(this.matrixPage);
  }
  setRoundStatus(input: Parameters<CollectionFormsRepository['setRoundStatus']>[0]) {
    this.roundStatusChanges.push(input);
    return Promise.resolve(this.roundStatusResult);
  }
  getSubmissionHistory(): Promise<Result<'getSubmissionHistory'>> {
    return Promise.resolve(this.history);
  }
  readFormHistory(input: Parameters<CollectionFormsRepository['readFormHistory']>[0]) {
    this.formHistoryReads.push(input);
    return Promise.resolve(this.formHistory);
  }
  saveDraft(): Promise<Result<'saveDraft'>> {
    return Promise.resolve(this.saveResult);
  }
  saveForm(input: Parameters<CollectionFormsRepository['saveForm']>[0]) {
    this.savedForms.push(input);
    return Promise.resolve(this.saveFormResult);
  }
  submit(): Promise<Result<'submit'>> {
    return Promise.resolve(this.submitResult);
  }
  updateFormStructure(): Promise<Result<'updateFormStructure'>> {
    return Promise.resolve(this.updateStructureResult);
  }
  updateFormMetadata(): Promise<Result<'updateFormMetadata'>> {
    return Promise.resolve(this.metadataResult);
  }
  updateTemplate(input: Parameters<CollectionFormsRepository['updateTemplate']>[0]) {
    return Promise.resolve(
      this.template === null ? null : { ...this.template, fields: input.fields, name: input.name },
    );
  }
}

/** Records what was asked of storage without moving any bytes. */
class FakeStorage implements CollectionFileStorage {
  deletedKeys: string[] = [];
  getObjectResult: Buffer | Error = Buffer.from('%PDF-1.7');
  putError: Error | null = null;
  storedObjects = new Map<string, Buffer>();
  presignedGets: { expiresInSeconds: number; key: string }[] = [];
  presignedPuts: { contentType: string; expiresInSeconds: number; key: string }[] = [];
  presignedPutError: Error | null = null;

  createPresignedPut(input: { contentType: string; expiresInSeconds: number; key: string }) {
    this.presignedPuts.push(input);
    if (this.presignedPutError !== null) return Promise.reject(this.presignedPutError);
    return Promise.resolve(`https://storage.example/put/${input.key}`);
  }
  createPresignedGet(input: { expiresInSeconds: number; key: string }) {
    this.presignedGets.push(input);
    return Promise.resolve(`https://storage.example/get/${input.key}`);
  }
  deleteObject(key: string): Promise<void> {
    this.deletedKeys.push(key);
    return Promise.resolve();
  }
  getObject(): Promise<Buffer> {
    if (this.getObjectResult instanceof Error) return Promise.reject(this.getObjectResult);
    return Promise.resolve(this.getObjectResult);
  }
  async putObjectStream(input: {
    body: AsyncIterable<Buffer>;
    contentType: string;
    key: string;
  }): Promise<number> {
    if (this.putError !== null) throw this.putError;
    const chunks: Buffer[] = [];
    for await (const chunk of input.body) chunks.push(chunk);
    const stored = Buffer.concat(chunks);
    this.storedObjects.set(input.key, stored);
    return stored.byteLength;
  }
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies the AsyncIterable contract; a sync generator does not
  async *getObjectStream(key: string): AsyncIterable<Buffer> {
    yield Buffer.from(`bytes:${key}`, 'utf8');
  }
}

class FakeInspector implements CollectionFileInspector {
  result: CollectionFileInspection | Error = {
    detectedContentType: 'application/pdf',
    errorCode: null,
    isAccepted: true,
  };

  inspect(): Promise<CollectionFileInspection> {
    if (this.result instanceof Error) return Promise.reject(this.result);
    return Promise.resolve(this.result);
  }
}

function setup(
  repository = new FakeRepository(),
  storage = new FakeStorage(),
  inspector = new FakeInspector(),
) {
  const clock: Clock = { now: () => NOW };
  return {
    inspector,
    repository,
    service: new CollectionFormsService(repository, clock, storage, inspector),
    storage,
  };
}

describe('CollectionFormsService', () => {
  const createBase = {
    actorAccountId: ACTOR,
    deadlineAt: null,
    description: '',
    groupId: FORM.groupId,
    title: 'แบบฟอร์ม',
  };

  it('creates a bounded form definition', async () => {
    await expect(
      setup().service.createForm({ ...createBase, fields: FORM.fields, title: ' รายงาน ' }),
    ).resolves.toEqual(FORM);
  });

  it('reports which field a definition error belongs to', async () => {
    await expect(
      setup().service.createForm({
        ...createBase,
        fields: [
          { description: '', id: 'choice', label: 'เลือก', required: true, type: 'single_choice' },
        ],
      }),
    ).rejects.toEqual(new CollectionFormsError('FIELD_OPTIONS_INVALID', 422, 'choice'));
  });

  it('accepts a file upload field with its own configuration', async () => {
    const { repository, service } = setup();
    await service.createForm({
      ...createBase,
      fields: [
        {
          description: 'แนบสำเนา',
          file: { allowedFileTypes: ['pdf'], maxFiles: 2 },
          id: 'doc',
          label: 'เอกสาร',
          required: true,
          type: 'file_upload',
        },
      ],
    });
    expect(repository.createdForms[0]?.fields[0]?.type).toBe('file_upload');
  });

  describe('structure editing', () => {
    it('allows structural edits after the form has been opened', async () => {
      const repository = new FakeRepository();
      repository.updateStructureResult = { ...FORM, status: 'open', version: 3 };
      await expect(
        setup(repository).service.updateFormStructure({
          actorAccountId: ACTOR,
          expectedVersion: 2,
          fields: FORM.fields,
          formId: FORM.id,
        }),
      ).resolves.toEqual({ ...FORM, status: 'open', version: 3 });
    });

    it('rejects a concurrent structural edit against an old form version', async () => {
      const repository = new FakeRepository();
      repository.updateStructureResult = 'stale';
      await expect(
        setup(repository).service.updateFormStructure({
          actorAccountId: ACTOR,
          expectedVersion: 1,
          fields: FORM.fields,
          formId: FORM.id,
        }),
      ).rejects.toEqual(new CollectionFormsError('FORM_STALE', 409));
    });

    it('requires a new field id when an existing field changes answer type', async () => {
      const repository = new FakeRepository();
      repository.updateStructureResult = {
        code: 'FIELD_TYPE_CHANGE_REQUIRES_NEW_ID',
        fieldId: TEXT_FIELD.id,
        outcome: 'invalid_transition',
      };
      await expect(
        setup(repository).service.updateFormStructure({
          actorAccountId: ACTOR,
          expectedVersion: 1,
          fields: [{ ...TEXT_FIELD, type: 'number' }],
          formId: FORM.id,
        }),
      ).rejects.toEqual(
        new CollectionFormsError('FIELD_TYPE_CHANGE_REQUIRES_NEW_ID', 422, TEXT_FIELD.id),
      );
    });

    it('still allows the permitted metadata edits', async () => {
      await expect(
        setup().service.updateFormMetadata({
          actorAccountId: ACTOR,
          deadlineAt: null,
          description: '',
          formId: FORM.id,
          title: 'ชื่อใหม่',
        }),
      ).resolves.toEqual({ ...FORM, title: 'ชื่อใหม่' });
    });

    it('refuses to pull a deadline earlier than the announced one', async () => {
      const repository = new FakeRepository();
      repository.metadataResult = 'deadline_earlier';
      await expect(
        setup(repository).service.updateFormMetadata({
          actorAccountId: ACTOR,
          deadlineAt: '2026-09-20T00:00:00.000Z',
          description: '',
          formId: FORM.id,
          title: 'รายงาน',
        }),
      ).rejects.toEqual(new CollectionFormsError('DEADLINE_NOT_EXTENDABLE', 409));
    });
  });

  describe('saving details and questions together', () => {
    const save = {
      actorAccountId: ACTOR,
      deadlineAt: '2026-10-01T09:00:00.000Z',
      description: ' คำอธิบาย ',
      expectedVersion: 1,
      fields: [TEXT_FIELD, { ...TEXT_FIELD, id: 'advisor', label: 'อาจารย์ที่ปรึกษา' }],
      formId: FORM.id,
      title: ' ชื่อใหม่ ',
    };

    it('passes both parts to one repository write under one version check', async () => {
      const { repository, service } = setup();
      await expect(service.saveForm(save)).resolves.toEqual({
        ...FORM,
        title: 'ชื่อใหม่',
        version: 2,
      });
      expect(repository.savedForms).toEqual([
        {
          actorAccountId: ACTOR,
          deadlineAt: new Date('2026-10-01T09:00:00.000Z'),
          description: 'คำอธิบาย',
          expectedVersion: 1,
          fields: save.fields,
          formId: FORM.id,
          now: NOW,
          title: 'ชื่อใหม่',
        },
      ]);
    });

    it('returns the unchanged form when the save changes nothing', async () => {
      const repository = new FakeRepository();
      repository.saveFormResult = FORM;
      await expect(
        setup(repository).service.saveForm({
          ...save,
          deadlineAt: null,
          description: FORM.description,
          fields: FORM.fields,
          title: FORM.title,
        }),
      ).resolves.toEqual(FORM);
    });

    it.each([
      ['stale', new CollectionFormsError('FORM_STALE', 409)],
      ['round_closed', new CollectionFormsError('ROUND_CLOSED', 409)],
      ['deadline_earlier', new CollectionFormsError('DEADLINE_NOT_EXTENDABLE', 409)],
      ['not_found', new CollectionFormsError('FORM_NOT_FOUND', 404)],
    ] as const)('maps a %s refusal to its error code', async (result, error) => {
      const repository = new FakeRepository();
      repository.saveFormResult = result;
      await expect(setup(repository).service.saveForm(save)).rejects.toEqual(error);
    });

    it('reports the field whose answer type changed without a new id', async () => {
      const repository = new FakeRepository();
      repository.saveFormResult = {
        code: 'FIELD_TYPE_CHANGE_REQUIRES_NEW_ID',
        fieldId: TEXT_FIELD.id,
        outcome: 'invalid_transition',
      };
      await expect(setup(repository).service.saveForm(save)).rejects.toEqual(
        new CollectionFormsError('FIELD_TYPE_CHANGE_REQUIRES_NEW_ID', 422, TEXT_FIELD.id),
      );
    });

    /*
     * Validation runs before the transaction, so a problem confined to one part
     * never lets the other part reach the database.
     */
    it.each([
      ['an empty title', { title: '   ' }, new CollectionFormsError('FORM_INVALID', 422)],
      [
        'an unreadable deadline',
        { deadlineAt: 'not-a-date' },
        new CollectionFormsError('FORM_INVALID', 422),
      ],
      [
        'an invalid question',
        {
          fields: [
            TEXT_FIELD,
            { description: '', id: 'pick', label: 'เลือก', required: true, type: 'single_choice' },
          ] satisfies CollectionField[],
        },
        new CollectionFormsError('FIELD_OPTIONS_INVALID', 422, 'pick'),
      ],
      [
        'a version below one',
        { expectedVersion: 0 },
        new CollectionFormsError('FORM_VERSION_INVALID', 422),
      ],
    ])('writes nothing for %s', async (_case, patch, error) => {
      const { repository, service } = setup();
      await expect(service.saveForm({ ...save, ...patch })).rejects.toEqual(error);
      expect(repository.savedForms).toEqual([]);
    });
  });

  describe('templates', () => {
    it('copies only the fields and descriptions into a new draft form', async () => {
      const { repository, service } = setup();
      await service.createFormFromTemplate({
        actorAccountId: ACTOR,
        groupId: FORM.groupId,
        templateId: TEMPLATE.id,
      });
      const created = repository.createdForms[0];
      expect(created).toMatchObject({
        createdFromTemplateId: TEMPLATE.id,
        // The template's own name seeds the title when none is given.
        description: TEMPLATE.description,
        fields: TEMPLATE.fields,
        groupId: FORM.groupId,
        title: TEMPLATE.name,
      });
      // A template carries no schedule of its own, so the new form starts without one.
      expect(created?.deadlineAt).toBeNull();
    });

    it('gives the new form its own copy so a later template edit cannot reach it', async () => {
      const { repository, service } = setup();
      await service.createFormFromTemplate({
        actorAccountId: ACTOR,
        groupId: FORM.groupId,
        templateId: TEMPLATE.id,
      });
      await service.updateTemplate({
        description: 'แก้ไขแล้ว',
        fields: [{ ...TEXT_FIELD, label: 'ชื่อบริษัทใหม่' }],
        name: 'แม่แบบใหม่',
        templateId: TEMPLATE.id,
      });
      expect(repository.createdForms[0]?.fields[0]?.label).toBe('บริษัท');
    });

    it('reports a missing template rather than creating an empty form', async () => {
      const repository = new FakeRepository();
      repository.template = null;
      await expect(
        setup(repository).service.createFormFromTemplate({
          actorAccountId: ACTOR,
          groupId: FORM.groupId,
          templateId: TEMPLATE.id,
        }),
      ).rejects.toEqual(new CollectionFormsError('TEMPLATE_NOT_FOUND', 404));
    });

    it('saves an existing form definition as a template', async () => {
      const { repository, service } = setup();
      await service.saveFormAsTemplate({
        actorAccountId: ACTOR,
        formId: FORM.id,
        name: 'แม่แบบจากฟอร์ม',
      });
      expect(repository.createdTemplates[0]).toMatchObject({
        fields: FORM.fields,
        name: 'แม่แบบจากฟอร์ม',
      });
    });
  });

  describe('reusable values', () => {
    const mappedForm: CollectionForm = {
      ...FORM,
      fields: [{ ...TEXT_FIELD, mappingKey: 'company-name' }],
    };

    it('fills a mapped field from the latest passed answer', async () => {
      const repository = new FakeRepository();
      repository.form = mappedForm;
      repository.reusableValues = [
        {
          fieldType: 'short_text',
          mappingKey: 'company-name',
          submittedAt: new Date('2026-09-01T00:00:00.000Z'),
          value: 'บริษัท ก',
        },
        {
          fieldType: 'short_text',
          mappingKey: 'company-name',
          submittedAt: new Date('2026-09-10T00:00:00.000Z'),
          value: 'บริษัท ข',
        },
      ];
      await expect(
        setup(repository).service.listPrefills({ formId: FORM.id, studentAccountId: STUDENT }),
      ).resolves.toEqual([{ fieldId: 'company', mappingKey: 'company-name', value: 'บริษัท ข' }]);
    });

    it('does not query for candidates when no field declares a mapping key', async () => {
      const repository = new FakeRepository();
      const spy = jest.spyOn(repository, 'listReusableValues');
      await expect(
        setup(repository).service.listPrefills({ formId: FORM.id, studentAccountId: STUDENT }),
      ).resolves.toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('uploads', () => {
    const fileForm: CollectionForm = {
      ...FORM,
      fields: [
        {
          description: '',
          file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
          id: 'doc',
          label: 'เอกสาร',
          required: true,
          type: 'file_upload',
        },
      ],
    };
    const request = {
      byteSize: 1_000,
      declaredContentType: 'application/pdf',
      fieldId: 'doc',
      filename: 'report.pdf',
      formId: FORM.id,
      studentAccountId: STUDENT,
    };

    it('registers the upload as pending until the browser finalizes its PUT', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      const { file } = await setup(repository).service.createUpload(request);
      expect(file.status).toBe('pending_upload');
      expect(file.detectedContentType).toBeNull();
    });

    it('derives an opaque storage key that carries no Student identity', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      await setup(repository).service.createUpload(request);
      const key = repository.createdUploads[0]!.storageKey;
      expect(key).toMatch(/^collection-files\/[0-9a-f-]{36}$/);
      expect(key).not.toContain(STUDENT);
      expect(key).not.toContain('report');
    });

    it('returns an upload URL scoped to that one key, not a public one', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      const { service, storage } = setup(repository);

      const { uploadUrl } = await service.createUpload(request);

      const issued = storage.presignedPuts[0]!;
      expect(issued.key).toBe(repository.createdUploads[0]!.storageKey);
      expect(issued.expiresInSeconds).toBeGreaterThan(0);
      expect(uploadUrl).toContain(issued.key);
      // The Student's identity must never travel in a storage URL.
      expect(uploadUrl).not.toContain(STUDENT);
    });

    it('does not register a slot when storage cannot issue an upload URL', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      const { service, storage } = setup(repository);
      storage.presignedPutError = new Error('STORAGE_UNAVAILABLE');

      await expect(service.createUpload(request)).rejects.toThrow('STORAGE_UNAVAILABLE');
      expect(repository.createdUploads).toEqual([]);
    });

    it('does not count a failed inspection against the field upload limit', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      repository.fieldFiles = [
        {
          byteSize: 1_000,
          createdAt: NOW,
          declaredContentType: 'application/pdf',
          detectedContentType: null,
          fieldId: 'doc',
          formId: FORM.id,
          id: '70000000-0000-4000-8000-000000000002',
          inspectionErrorCode: 'FILE_INSPECTION_FAILED',
          originalFilename: 'failed.pdf',
          status: 'failed',
          studentAccountId: STUDENT,
        },
      ];

      await expect(setup(repository).service.createUpload(request)).resolves.toBeDefined();
    });

    it('does not count an expired pending ticket against the field upload limit', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      repository.fieldFiles = [
        {
          byteSize: 1_000,
          createdAt: new Date(NOW.getTime() - 16 * 60 * 1_000),
          declaredContentType: 'application/pdf',
          detectedContentType: null,
          fieldId: 'doc',
          formId: FORM.id,
          id: '70000000-0000-4000-8000-000000000003',
          inspectionErrorCode: null,
          originalFilename: 'abandoned.pdf',
          status: 'pending_upload',
          studentAccountId: STUDENT,
        },
      ];

      await expect(setup(repository).service.createUpload(request)).resolves.toBeDefined();
    });

    it('rejects finalizing an upload outside the Student form scope', async () => {
      const repository = new FakeRepository();
      repository.finalizeResult = 'not_found';

      await expect(
        setup(repository).service.finalizeUpload({
          fileId: '70000000-0000-4000-8000-000000000001',
          formId: FORM.id,
          studentAccountId: STUDENT,
        }),
      ).rejects.toEqual(new CollectionFormsError('FILE_NOT_FOUND', 404));
    });

    it('reports a form deleted after the upload was checked as not found', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      repository.isFormDeletedBeforeUpload = true;

      await expect(setup(repository).service.createUpload(request)).rejects.toEqual(
        new CollectionFormsError('FORM_NOT_FOUND', 404),
      );
    });

    it.each([
      ['finalizing', 'finalizeResult'],
      ['attaching', 'attachResult'],
      ['detaching', 'detachResult'],
    ] as const)('reports a deleted form when %s a file as not found', async (_action, result) => {
      const repository = new FakeRepository();
      repository[result] = 'form_not_found';
      const service = setup(repository).service;
      const input = {
        fieldId: 'doc',
        fileId: '70000000-0000-4000-8000-000000000001',
        formId: FORM.id,
        studentAccountId: STUDENT,
      };
      const call =
        result === 'finalizeResult'
          ? service.finalizeUpload(input)
          : result === 'attachResult'
            ? service.attachDraftFile(input)
            : service.detachDraftFile(input);

      await expect(call).rejects.toEqual(new CollectionFormsError('FORM_NOT_FOUND', 404));
    });

    it('reissues a URL for the same pending upload slot', async () => {
      const repository = new FakeRepository();
      const { service, storage } = setup(repository);
      await expect(
        service.retryUpload({ fileId: 'file-id', formId: FORM.id, studentAccountId: STUDENT }),
      ).resolves.toEqual({ uploadUrl: 'https://storage.example/put/collection-files/existing' });
      expect(storage.presignedPuts).toHaveLength(1);
      expect(storage.presignedPuts[0]).toMatchObject({
        contentType: 'application/pdf',
        key: 'collection-files/existing',
      });
      expect(storage.presignedPuts[0]?.expiresInSeconds).toBeGreaterThan(0);
    });

    it('does not reissue a URL outside the Student form scope', async () => {
      const repository = new FakeRepository();
      repository.retryUpload = null;
      const { service, storage } = setup(repository);
      await expect(
        service.retryUpload({ fileId: 'file-id', formId: FORM.id, studentAccountId: STUDENT }),
      ).rejects.toEqual(new CollectionFormsError('FILE_NOT_FOUND', 404));
      expect(storage.presignedPuts).toEqual([]);
    });

    it('rejects a request for a field the form does not have', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      await expect(
        setup(repository).service.createUpload({ ...request, fieldId: 'missing' }),
      ).rejects.toEqual(new CollectionFormsError('FIELD_NOT_FOUND', 404));
    });

    it('rejects a type the Instructor did not allow, naming the field', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      await expect(
        setup(repository).service.createUpload({
          ...request,
          declaredContentType: 'image/png',
          filename: 'scan.png',
        }),
      ).rejects.toEqual(new CollectionFormsError('FILE_TYPE_NOT_ALLOWED', 422, 'doc'));
    });
  });

  describe('drafts and submission', () => {
    it('accepts an incomplete draft so autosave never rejects work in progress', async () => {
      await expect(
        setup().service.saveDraft({
          answers: { company: '' },
          expectedVersion: 1,
          formId: FORM.id,
          studentAccountId: STUDENT,
        }),
      ).resolves.toEqual({ version: 1 });
    });

    it('rejects an answer for a field the form does not have', async () => {
      await expect(
        setup().service.saveDraft({
          answers: { unknown: 'x' },
          expectedVersion: 1,
          formId: FORM.id,
          studentAccountId: STUDENT,
        }),
      ).rejects.toEqual(new CollectionFormsError('ANSWER_FIELD_UNKNOWN', 422, 'unknown'));
    });

    it('maps a stale draft to a conflict the client can reconcile', async () => {
      const repository = new FakeRepository();
      repository.saveResult = 'stale';
      await expect(
        setup(repository).service.saveDraft({
          answers: {},
          expectedVersion: 1,
          formId: FORM.id,
          studentAccountId: STUDENT,
        }),
      ).rejects.toEqual(new CollectionFormsError('DRAFT_STALE', 409));
    });

    it('reports a draft saved to a form deleted after the read as not found', async () => {
      const repository = new FakeRepository();
      repository.saveResult = 'not_found';
      await expect(
        setup(repository).service.saveDraft({
          answers: {},
          expectedVersion: 1,
          formId: FORM.id,
          studentAccountId: STUDENT,
        }),
      ).rejects.toEqual(new CollectionFormsError('FORM_NOT_FOUND', 404));
    });

    it('reports a submission to a deleted form as not found', async () => {
      const repository = new FakeRepository();
      repository.submitResult = 'not_found';
      await expect(setup(repository).service.submit(FORM.id, STUDENT, 'key')).rejects.toEqual(
        new CollectionFormsError('FORM_NOT_FOUND', 404),
      );
    });

    it('surfaces the offending field when submission validation fails', async () => {
      const repository = new FakeRepository();
      repository.submitResult = { code: 'FILE_NOT_READY', fieldId: 'doc', outcome: 'invalid' };
      await expect(setup(repository).service.submit(FORM.id, STUDENT, 'key')).rejects.toEqual(
        new CollectionFormsError('FILE_NOT_READY', 422, 'doc'),
      );
    });

    it('requires actionable feedback when requesting changes', async () => {
      await expect(
        setup().service.checkSubmission({
          actorAccountId: ACTOR,
          decision: 'changes_required',
          expectedSubmissionId: 'x',
          reason: ' ',
        }),
      ).rejects.toEqual(new CollectionFormsError('CHECK_REASON_REQUIRED', 422));
    });

    it('maps a stale checking decision to a conflict', async () => {
      const repository = new FakeRepository();
      repository.checkResult = 'stale';
      await expect(
        setup(repository).service.checkSubmission({
          actorAccountId: ACTOR,
          decision: 'passed',
          expectedSubmissionId: 'x',
          reason: null,
        }),
      ).rejects.toEqual(new CollectionFormsError('SUBMISSION_STALE', 409));
    });
  });

  describe('inspectNextFile', () => {
    const CLAIMED = {
      declaredContentType: 'application/pdf',
      id: '70000000-0000-4000-8000-000000000009',
      leaseId: '70000000-0000-4000-8000-000000000010',
      originalFilename: 'report.pdf',
      storageKey: 'collection-files/00000000-0000-4000-8000-00000000000a',
    };

    it('reports that there was nothing to inspect', async () => {
      const { repository, service } = setup();

      await expect(service.inspectNextFile()).resolves.toBe(false);
      expect(repository.completedInspections).toEqual([]);
    });

    it('records a pass only with the type the bytes actually are', async () => {
      const repository = new FakeRepository();
      repository.claimable = CLAIMED;
      const { service } = setup(repository);

      await expect(service.inspectNextFile()).resolves.toBe(true);

      expect(repository.completedInspections[0]).toEqual({
        detectedContentType: 'application/pdf',
        errorCode: null,
        fileId: CLAIMED.id,
        isAccepted: true,
        leaseId: CLAIMED.leaseId,
        now: NOW,
      });
    });

    it('fails a file whose bytes the inspector rejected', async () => {
      const repository = new FakeRepository();
      repository.claimable = CLAIMED;
      const inspector = new FakeInspector();
      inspector.result = {
        detectedContentType: null,
        errorCode: 'FILE_CONTENT_UNRECOGNIZED',
        isAccepted: false,
      };
      const { service } = setup(repository, new FakeStorage(), inspector);

      await service.inspectNextFile();

      expect(repository.completedInspections[0]).toMatchObject({
        errorCode: 'FILE_CONTENT_UNRECOGNIZED',
        isAccepted: false,
      });
    });

    it('fails the file when the bytes cannot be read, rather than leaving it claimed', async () => {
      /*
       * An unreadable file is an uninspected file. Recording a failure is what
       * keeps it out of `inspecting` forever and out of `ready` entirely.
       */
      const repository = new FakeRepository();
      repository.claimable = CLAIMED;
      const storage = new FakeStorage();
      storage.getObjectResult = new Error('COLLECTION_FILE_GET_FAILED');
      const { service } = setup(repository, storage);

      await expect(service.inspectNextFile()).resolves.toBe(true);

      expect(repository.completedInspections[0]).toMatchObject({
        errorCode: 'FILE_INSPECTION_UNAVAILABLE',
        isAccepted: false,
      });
    });

    it('fails the file when the inspector itself throws', async () => {
      const repository = new FakeRepository();
      repository.claimable = CLAIMED;
      const inspector = new FakeInspector();
      inspector.result = new Error('boom');
      const { service } = setup(repository, new FakeStorage(), inspector);

      await service.inspectNextFile();

      expect(repository.completedInspections[0]!.isAccepted).toBe(false);
    });
  });

  describe('createDownload', () => {
    const READABLE = {
      originalFilename: 'report.pdf',
      status: 'ready' as const,
      storageKey: 'collection-files/00000000-0000-4000-8000-00000000000b',
    };
    const request = {
      actorAccountId: STUDENT,
      fileId: '70000000-0000-4000-8000-000000000009',
      isInstructor: false,
    };

    it('issues a short-lived signed URL for a file the caller may read', async () => {
      const repository = new FakeRepository();
      repository.readableFile = READABLE;
      const { service, storage } = setup(repository);

      const result = await service.createDownload(request);

      expect(storage.presignedGets[0]!.key).toBe(READABLE.storageKey);
      expect(storage.presignedGets[0]!.expiresInSeconds).toBeGreaterThan(0);
      expect(result.filename).toBe('report.pdf');
    });

    it('refuses a file the caller is not allowed to read', async () => {
      const repository = new FakeRepository();
      repository.readableFile = null;
      const { service, storage } = setup(repository);

      await expect(service.createDownload(request)).rejects.toEqual(
        new CollectionFormsError('FILE_NOT_FOUND', 404),
      );
      expect(storage.presignedGets).toEqual([]);
    });

    it.each(['quarantined', 'inspecting', 'failed'] as const)(
      'refuses to hand back a %s file, which has not passed inspection',
      async (status) => {
        const repository = new FakeRepository();
        repository.readableFile = { ...READABLE, status };
        const { service, storage } = setup(repository);

        await expect(service.createDownload(request)).rejects.toEqual(
          new CollectionFormsError('FILE_NOT_READY', 409),
        );
        expect(storage.presignedGets).toEqual([]);
      },
    );

    it('sanitizes a filename that tries to escape its directory', async () => {
      const repository = new FakeRepository();
      repository.readableFile = { ...READABLE, originalFilename: '../../etc/passwd' };
      const { service } = setup(repository);

      const result = await service.createDownload(request);

      expect(result.filename).toBe('passwd');
    });
  });

  describe('review queue', () => {
    it('returns the form and its entries', async () => {
      const repository = new FakeRepository();
      repository.formSubmissions = {
        entries: [
          {
            firstSubmittedAt: NOW,
            isLate: false,
            latestCheckingReason: null,
            latestSubmission: {
              answers: { company: 'บริษัท ก' },
              fields: FORM.fields,
              files: {},
              formVersion: 1,
              id: '50000000-0000-4000-8000-000000000009',
              submittedAt: NOW,
              version: 1,
            },
            rosterName: { firstNameTh: 'นักศึกษา', lastNameTh: 'ทดสอบ' },
            status: 'awaiting_checking',
            studentAccountId: STUDENT,
            studentId: '69000001',
          },
        ],
        form: FORM,
      };
      const { service } = setup(repository);

      const result = await service.listFormSubmissions(FORM.id);

      expect(result.form.id).toBe(FORM.id);
      expect(result.entries[0]?.status).toBe('awaiting_checking');
    });

    it('reports a missing form as 404 rather than an empty queue', async () => {
      const repository = new FakeRepository();
      repository.formSubmissions = null;
      const { service } = setup(repository);

      await expect(service.listFormSubmissions(FORM.id)).rejects.toEqual(
        new CollectionFormsError('FORM_NOT_FOUND', 404),
      );
    });
  });

  describe('closeForm', () => {
    it('stops first submissions with an audited reason', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      const form = await service.closeForm({
        actorAccountId: ACTOR,
        formId: FORM.id,
        reason: '  หมดเขตรับเอกสารรอบแรก  ',
      });

      expect(form.status).toBe('closed');
      expect(repository.closedForms[0]).toMatchObject({
        actorAccountId: ACTOR,
        formId: FORM.id,
        now: NOW,
        reason: 'หมดเขตรับเอกสารรอบแรก',
      });
    });

    it('requires a reason', async () => {
      const { service } = setup();

      await expect(
        service.closeForm({ actorAccountId: ACTOR, formId: FORM.id, reason: '   ' }),
      ).rejects.toEqual(new CollectionFormsError('REASON_REQUIRED', 422));
    });

    it('rejects closing a form that is not open', async () => {
      const repository = new FakeRepository();
      repository.closeResult = 'not_open';
      const { service } = setup(repository);

      await expect(
        service.closeForm({ actorAccountId: ACTOR, formId: FORM.id, reason: 'ปิดรับ' }),
      ).rejects.toEqual(new CollectionFormsError('FORM_NOT_OPEN', 409));
    });

    it('rejects closing inside a closed round', async () => {
      const repository = new FakeRepository();
      repository.closeResult = 'round_closed';
      const { service } = setup(repository);

      await expect(
        service.closeForm({ actorAccountId: ACTOR, formId: FORM.id, reason: 'ปิดรับ' }),
      ).rejects.toEqual(new CollectionFormsError('ROUND_CLOSED', 409));
    });
  });

  describe('reopenForm', () => {
    it('previews how many obligations a reopen would create', async () => {
      const { service } = setup();

      await expect(service.previewFormReopen(FORM.id)).resolves.toEqual({ newlyAssignedCount: 2 });
    });

    it('reports the assigned count after reopening', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      const result = await service.reopenForm({
        actorAccountId: ACTOR,
        formId: FORM.id,
        reason: 'เปิดรับเพิ่มสำหรับผู้เข้าร่วมใหม่',
      });

      expect(result).toEqual({ form: { ...FORM, status: 'open' }, newlyAssignedCount: 2 });
      expect(repository.reopenedForms[0]?.reason).toBe('เปิดรับเพิ่มสำหรับผู้เข้าร่วมใหม่');
    });

    it('requires a reason to reopen', async () => {
      const { service } = setup();

      await expect(
        service.reopenForm({ actorAccountId: ACTOR, formId: FORM.id, reason: '' }),
      ).rejects.toEqual(new CollectionFormsError('REASON_REQUIRED', 422));
    });

    it('rejects reopening a form that is not closed', async () => {
      const repository = new FakeRepository();
      repository.reopenResult = 'not_closed';
      const { service } = setup(repository);

      await expect(
        service.reopenForm({ actorAccountId: ACTOR, formId: FORM.id, reason: 'เปิดรับ' }),
      ).rejects.toEqual(new CollectionFormsError('FORM_NOT_CLOSED', 409));
    });
  });

  describe('group matrix', () => {
    const GROUP = '90000000-0000-4000-8000-000000000001';

    it('clamps an oversized page request to the bound', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await service.readGroupMatrix({
        afterStudentAccountId: null,
        groupId: GROUP,
        limit: 10_000,
      });

      expect(repository.matrixReads[0]?.limit).toBe(MAX_MATRIX_ROWS);
    });

    it('bounds a page request that asked for nothing', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await service.readGroupMatrix({
        afterStudentAccountId: null,
        groupId: GROUP,
        limit: undefined,
      });

      expect(repository.matrixReads[0]?.limit).toBe(MAX_MATRIX_ROWS);
    });

    it('passes a smaller page request through', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await service.readGroupMatrix({
        afterStudentAccountId: 'a0000000-0000-4000-8000-000000000001',
        groupId: GROUP,
        limit: 5,
      });

      expect(repository.matrixReads[0]).toMatchObject({
        afterStudentAccountId: 'a0000000-0000-4000-8000-000000000001',
        limit: 5,
      });
    });

    it('reports an unknown group as not found', async () => {
      const repository = new FakeRepository();
      repository.matrixPage = null;
      const { service } = setup(repository);

      await expect(
        service.readGroupMatrix({ afterStudentAccountId: null, groupId: GROUP, limit: undefined }),
      ).rejects.toEqual(new CollectionFormsError('GROUP_NOT_FOUND', 404));
    });
  });

  describe('round closure', () => {
    const ROUND = '80000000-0000-4000-8000-000000000001';

    it('summarizes outstanding work before closing', async () => {
      const { service } = setup();

      await expect(service.getRoundPendingWork(ROUND)).resolves.toEqual({
        awaitingChecking: 1,
        changesRequired: 2,
        notSubmitted: 3,
        total: 6,
      });
    });

    it('reports a missing round as 404', async () => {
      const repository = new FakeRepository();
      repository.pendingWork = null;
      const { service } = setup(repository);

      await expect(service.getRoundPendingWork(ROUND)).rejects.toEqual(
        new CollectionFormsError('ROUND_NOT_FOUND', 404),
      );
    });

    it('closes a round with a reason and retains the confirmed counts', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      const result = await service.closeRound({
        actorAccountId: ACTOR,
        reason: 'สิ้นสุดภาคการศึกษา',
        roundId: ROUND,
      });

      expect(result.pendingWork.total).toBe(6);
      expect(repository.roundStatusChanges[0]).toMatchObject({
        expectedStatus: 'active',
        nextStatus: 'closed',
        reason: 'สิ้นสุดภาคการศึกษา',
        roundId: ROUND,
      });
    });

    it('reopens a round with a required reason', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await service.reopenRound({
        actorAccountId: ACTOR,
        reason: 'ต้องรับเอกสารเพิ่ม',
        roundId: ROUND,
      });

      expect(repository.roundStatusChanges[0]).toMatchObject({
        expectedStatus: 'closed',
        nextStatus: 'active',
      });
    });

    it('requires a reason to reopen a round', async () => {
      const { service } = setup();

      await expect(
        service.reopenRound({ actorAccountId: ACTOR, reason: ' ', roundId: ROUND }),
      ).rejects.toEqual(new CollectionFormsError('REASON_REQUIRED', 422));
    });

    it('rejects closing a round that is already closed', async () => {
      const repository = new FakeRepository();
      repository.roundStatusResult = 'already_in_state';
      const { service } = setup(repository);

      await expect(
        service.closeRound({ actorAccountId: ACTOR, reason: 'ปิดรอบ', roundId: ROUND }),
      ).rejects.toEqual(new CollectionFormsError('ROUND_ALREADY_CLOSED', 409));
    });
  });

  describe('getSubmissionHistory', () => {
    it('returns every retained version for the Student who owns it', async () => {
      const repository = new FakeRepository();
      repository.history = {
        entries: [
          {
            answers: { company: 'บริษัท ก' },
            checkingEvents: [
              {
                decision: 'changes_required',
                instructorName: 'อาจารย์ ก',
                occurredAt: NOW,
                reason: 'แก้ไขชื่อบริษัท',
              },
            ],
            files: {},
            fields: FORM.fields,
            formVersion: 1,
            id: '50000000-0000-4000-8000-000000000001',
            submittedAt: NOW,
            version: 1,
          },
        ],
        firstSubmittedAt: NOW,
        form: FORM,
        isLate: false,
        status: 'changes_required',
      };
      const { service } = setup(repository);

      const history = await service.getSubmissionHistory({
        actorAccountId: STUDENT,
        formId: FORM.id,
        isInstructor: false,
        studentAccountId: STUDENT,
      });

      expect(history.entries).toHaveLength(1);
      expect(history.entries[0]?.checkingEvents[0]?.reason).toBe('แก้ไขชื่อบริษัท');
    });

    it('does not distinguish an unauthorized history from a missing one', async () => {
      const repository = new FakeRepository();
      repository.history = null;
      const { service } = setup(repository);

      await expect(
        service.getSubmissionHistory({
          actorAccountId: STUDENT,
          formId: FORM.id,
          isInstructor: false,
          studentAccountId: '20000000-0000-4000-8000-00000000000f',
        }),
      ).rejects.toEqual(new CollectionFormsError('OBLIGATION_NOT_FOUND', 404));
    });
  });

  describe('getFormHistory', () => {
    const SAVE_ID = '58000000-0000-4000-8000-000000000002';
    const OPENED_ID = '58000000-0000-4000-8000-000000000001';

    it('describes each entry and ends without a cursor on the last page', async () => {
      const repository = new FakeRepository();
      repository.formHistory = {
        entries: [
          {
            actorName: 'ผู้สอน ทดสอบ',
            events: [
              { kind: 'title', next: 'แบบฟอร์มใหม่', previous: 'แบบฟอร์ม' },
              { kind: 'structure', nextFields: [TEXT_FIELD], previousFields: [] },
            ],
            id: SAVE_ID,
            occurredAt: NOW,
            occurredAtMicros: '1790071200000000',
          },
        ],
        hasMore: false,
      };
      const { service } = setup(repository);

      const history = await service.getFormHistory({ cursor: undefined, formId: FORM.id });

      expect(history).toEqual({
        entries: [
          {
            actorName: 'ผู้สอน ทดสอบ',
            changes: [
              { kind: 'title_changed', next: 'แบบฟอร์มใหม่', previous: 'แบบฟอร์ม' },
              { kind: 'question_added', label: TEXT_FIELD.label },
            ],
            id: SAVE_ID,
            occurredAt: NOW,
          },
        ],
        nextCursor: null,
      });
      expect(repository.formHistoryReads).toEqual([{ before: null, formId: FORM.id, limit: 20 }]);
    });

    it('continues from the last entry of a full page', async () => {
      const repository = new FakeRepository();
      repository.formHistory = {
        entries: [
          {
            actorName: 'ผู้สอน ทดสอบ',
            events: [{ assignedCount: 3, kind: 'opened' }],
            id: OPENED_ID,
            occurredAt: NOW,
            occurredAtMicros: '1790071200000001',
          },
        ],
        hasMore: true,
      };
      const { service } = setup(repository);
      const cursor = encodeFormHistoryCursor({
        entryId: SAVE_ID,
        occurredAtMicros: '1790071200000002',
      });

      const history = await service.getFormHistory({ cursor, formId: FORM.id });

      expect(repository.formHistoryReads[0]?.before).toEqual({
        entryId: SAVE_ID,
        occurredAtMicros: '1790071200000002',
      });
      expect(decodeFormHistoryCursor(history.nextCursor ?? '')).toEqual({
        entryId: OPENED_ID,
        occurredAtMicros: '1790071200000001',
      });
    });

    it('rejects a cursor it did not issue before reading', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await expect(
        service.getFormHistory({ cursor: 'bm90LWEtY3Vyc29y', formId: FORM.id }),
      ).rejects.toEqual(new CollectionFormsError('FORM_HISTORY_CURSOR_INVALID', 400));
      expect(repository.formHistoryReads).toEqual([]);
    });

    it('reports a missing form', async () => {
      const repository = new FakeRepository();
      repository.formHistory = null;
      const { service } = setup(repository);

      await expect(service.getFormHistory({ cursor: undefined, formId: FORM.id })).rejects.toEqual(
        new CollectionFormsError('FORM_NOT_FOUND', 404),
      );
    });
  });

  describe('notifications', () => {
    const STUDENT = 'b0000000-0000-4000-8000-000000000001';
    const NOTIFICATION = 'c0000000-0000-4000-8000-000000000001';

    it('records the reminders the repository reported as due', async () => {
      const repository = new FakeRepository();
      repository.dueReminders = [
        { formId: FORM.id, kind: 'deadline_reminder', studentAccountId: STUDENT, subjectKey: '3' },
      ];
      const { service } = setup(repository);

      await expect(service.dispatchDueReminders()).resolves.toBe(1);
      expect(repository.recordedNotifications[0]?.notifications).toEqual(repository.dueReminders);
    });

    /* Nothing due must cost nothing: an empty batch is not a write. */
    it('writes nothing when no reminder is due', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await expect(service.dispatchDueReminders()).resolves.toBe(0);
      expect(repository.recordedNotifications).toHaveLength(0);
    });

    it('sends an announcement through to the repository', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await expect(
        service.notify([
          {
            formId: FORM.id,
            kind: 'submission_passed',
            studentAccountId: STUDENT,
            subjectKey: 'submission-1',
          },
        ]),
      ).resolves.toBe(1);
    });

    it('reads the feed for the caller only', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await expect(service.readNotificationFeed(STUDENT)).resolves.toEqual({
        notifications: [],
        unreadCount: 0,
      });
    });

    it('marks notifications read scoped to the caller', async () => {
      const repository = new FakeRepository();
      const { service } = setup(repository);

      await expect(
        service.markNotificationsRead({
          notificationIds: [NOTIFICATION],
          studentAccountId: STUDENT,
        }),
      ).resolves.toEqual({ readCount: 1 });
      expect(repository.notificationReads[0]?.studentAccountId).toBe(STUDENT);
    });

    /* An unbounded id list would turn one read receipt into an unbounded write. */
    it('refuses a read batch larger than one page of the feed', async () => {
      const { service } = setup();

      await expect(
        service.markNotificationsRead({
          notificationIds: Array.from({ length: 51 }, () => NOTIFICATION),
          studentAccountId: STUDENT,
        }),
      ).rejects.toEqual(new CollectionFormsError('NOTIFICATION_BATCH_TOO_LARGE', 422));
    });
  });

  describe('exports', () => {
    const GROUP = FORM.groupId;
    const EXPORT_ID = '70000000-0000-4000-8000-000000000001';
    const SUBMISSION = '71000000-0000-4000-8000-000000000001';

    function job(overrides: Partial<CollectionExportJob> = {}): CollectionExportJob {
      return {
        byteSize: null,
        errorCode: null,
        expiresAt: null,
        groupId: GROUP,
        id: EXPORT_ID,
        kind: 'excel',
        readyAt: null,
        requestedAt: NOW,
        requestedByAccountId: ACTOR,
        status: 'pending',
        ...overrides,
      };
    }

    describe('creation', () => {
      it('freezes a snapshot and returns a pending job rather than building inline', async () => {
        const repository = new FakeRepository();
        repository.createExportResult = job();
        const { service } = setup(repository);

        const created = await service.createExport({
          formIds: [FORM.id],
          groupId: GROUP,
          kind: 'excel',
          requestedByAccountId: ACTOR,
        });

        expect(created.status).toBe('pending');
        expect(repository.createdExports[0]).toMatchObject({
          formIds: [FORM.id],
          groupId: GROUP,
          kind: 'excel',
          now: NOW,
          requestedByAccountId: ACTOR,
        });
      });

      it('refuses an empty selection instead of exporting the whole group', async () => {
        const { service } = setup();
        await expect(
          service.createExport({
            formIds: [],
            groupId: GROUP,
            kind: 'zip',
            requestedByAccountId: ACTOR,
          }),
        ).rejects.toEqual(new CollectionFormsError('EXPORT_FORMS_REQUIRED', 422));
      });

      it('refuses more forms than one snapshot may hold', async () => {
        const { service, repository } = setup();
        await expect(
          service.createExport({
            formIds: Array.from({ length: MAX_EXPORT_FORMS + 1 }, (_value, index) =>
              index.toString(),
            ),
            groupId: GROUP,
            kind: 'excel',
            requestedByAccountId: ACTOR,
          }),
        ).rejects.toEqual(new CollectionFormsError('EXPORT_FORM_COUNT_EXCEEDED', 422));
        expect(repository.createdExports).toHaveLength(0);
      });

      /* Refused, not truncated: a tracking sheet missing Students is worse. */
      it('refuses a snapshot that exceeded the scope limit', async () => {
        const repository = new FakeRepository();
        repository.createExportResult = new CollectionExportTooLargeError();
        const { service } = setup(repository);

        await expect(
          service.createExport({
            formIds: [FORM.id],
            groupId: GROUP,
            kind: 'zip',
            requestedByAccountId: ACTOR,
          }),
        ).rejects.toEqual(new CollectionFormsError('EXPORT_SCOPE_TOO_LARGE', 422));
      });

      it('reports a group or selection that resolved to nothing', async () => {
        const repository = new FakeRepository();
        repository.createExportResult = null;
        const { service } = setup(repository);

        await expect(
          service.createExport({
            formIds: [FORM.id],
            groupId: GROUP,
            kind: 'excel',
            requestedByAccountId: ACTOR,
          }),
        ).rejects.toEqual(new CollectionFormsError('EXPORT_SCOPE_EMPTY', 404));
      });
    });

    describe('download authorization', () => {
      it('issues a short-lived URL for a ready artifact', async () => {
        const repository = new FakeRepository();
        repository.exportsById.set(
          EXPORT_ID,
          job({
            byteSize: 1_024,
            expiresAt: new Date(NOW.getTime() + 60_000),
            readyAt: NOW,
            status: 'ready',
          }),
        );
        const { service, storage } = setup(repository);

        const download = await service.createExportDownload({ exportId: EXPORT_ID });

        expect(download.contentType).toBe(EXPORT_CONTENT_TYPES.excel);
        expect(storage.presignedGets[0]?.key).toBe(`collection-exports/${EXPORT_ID}.xlsx`);
        /* The URL outlives the click and nothing more. */
        expect(storage.presignedGets[0]?.expiresInSeconds).toBeLessThanOrEqual(300);
      });

      /* Expiry is decided from the recorded instant, never from whether the
       * cleanup sweep has physically removed the bytes yet. */
      it('denies a download past expiry even though cleanup may not have run', async () => {
        const repository = new FakeRepository();
        repository.exportsById.set(
          EXPORT_ID,
          job({
            expiresAt: new Date(NOW.getTime() - 1),
            readyAt: new Date(NOW.getTime() - 86_400_000),
            status: 'ready',
          }),
        );
        const { service, storage } = setup(repository);

        await expect(service.createExportDownload({ exportId: EXPORT_ID })).rejects.toEqual(
          new CollectionFormsError('EXPORT_EXPIRED', 409),
        );
        expect(storage.presignedGets).toHaveLength(0);
      });

      it('denies a download while the artifact is still being built', async () => {
        const repository = new FakeRepository();
        repository.exportsById.set(EXPORT_ID, job({ status: 'building' }));
        const { service } = setup(repository);

        await expect(service.createExportDownload({ exportId: EXPORT_ID })).rejects.toEqual(
          new CollectionFormsError('EXPORT_NOT_READY', 409),
        );
      });

      it('exposes retry rather than a partial archive when the build failed', async () => {
        const repository = new FakeRepository();
        repository.exportsById.set(
          EXPORT_ID,
          job({ errorCode: 'EXPORT_BUILD_FAILED', status: 'failed' }),
        );
        const { service } = setup(repository);

        await expect(service.createExportDownload({ exportId: EXPORT_ID })).rejects.toEqual(
          new CollectionFormsError('EXPORT_FAILED', 409),
        );
      });

      it('reports an unknown export as missing', async () => {
        const { service } = setup();
        await expect(service.createExportDownload({ exportId: EXPORT_ID })).rejects.toEqual(
          new CollectionFormsError('EXPORT_NOT_FOUND', 404),
        );
      });
    });

    describe('building', () => {
      function claim(overrides: Partial<ClaimedCollectionExport> = {}) {
        return {
          attemptCount: 1,
          entries: [
            {
              fields: [
                { description: '', id: 'name', label: 'ชื่อ', required: true, type: 'short_text' },
              ] as CollectionField[],
              formId: FORM.id,
              isLate: false,
              obligationStatus: 'passed',
              position: 0,
              studentAccountId: STUDENT,
              studentDisplayName: 'สมชาย ใจดี',
              studentId: '69000001',
              submissionId: SUBMISSION,
              submittedAt: NOW,
            },
          ],
          forms: [
            {
              fields: [
                { description: '', id: 'name', label: 'ชื่อ', required: true, type: 'short_text' },
              ] as CollectionField[],
              formId: FORM.id,
              position: 0,
              title: 'ใบสมัคร',
            },
          ],
          groupId: GROUP,
          id: EXPORT_ID,
          kind: 'excel' as const,
          leaseId: '72000000-0000-4000-8000-000000000001',
          ...overrides,
        };
      }

      it('reports an empty queue without writing, so a worker can back off', async () => {
        const { service, storage } = setup();
        await expect(service.buildNextExport()).resolves.toBe(false);
        expect(storage.storedObjects.size).toBe(0);
      });

      it('keeps draining after failing an export whose group was deleted', async () => {
        const repository = new FakeRepository();
        repository.claimedExport = 'group_deleted';
        const { service, storage } = setup(repository);

        await expect(service.buildNextExport()).resolves.toBe(true);
        expect(storage.storedObjects.size).toBe(0);
        expect(repository.completedExports).toEqual([]);
        expect(repository.failedExports).toEqual([]);
      });

      it('streams a workbook into storage and marks the export ready', async () => {
        const repository = new FakeRepository();
        repository.claimedExport = claim();
        repository.submissionAnswers.set(SUBMISSION, { name: 'สมชาย' });
        const { service, storage } = setup(repository);

        await expect(service.buildNextExport()).resolves.toBe(true);

        const key = `collection-exports/${EXPORT_ID}.xlsx`;
        const stored = storage.storedObjects.get(key);
        expect(stored?.byteLength).toBeGreaterThan(0);
        /* An .xlsx is a ZIP, so it starts with the local file header magic. */
        expect(stored?.subarray(0, 2).toString('latin1')).toBe('PK');
        expect(repository.completedExports[0]).toMatchObject({
          byteSize: stored?.byteLength,
          exportId: EXPORT_ID,
          leaseId: claim().leaseId,
          storageKey: key,
        });
      });

      it('starts the twenty-four hour clock when the artifact becomes ready', async () => {
        const repository = new FakeRepository();
        repository.claimedExport = claim();
        const { service } = setup(repository);

        await service.buildNextExport();

        expect(repository.completedExports[0]?.expiresAt.getTime()).toBe(
          NOW.getTime() + 86_400_000,
        );
      });

      it('streams an archive of the frozen documents for a ZIP export', async () => {
        const repository = new FakeRepository();
        repository.claimedExport = claim({ kind: 'zip' });
        repository.exportDocuments.set(SUBMISSION, [
          {
            fieldId: 'transcript',
            originalFilename: 'เอกสาร.pdf',
            position: 0,
            storageKey: 'collection-files/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
        ]);
        const { service, storage } = setup(repository);

        await expect(service.buildNextExport()).resolves.toBe(true);

        const stored = storage.storedObjects.get(`collection-exports/${EXPORT_ID}.zip`);
        expect(stored).toBeDefined();
        const text = stored?.toString('utf8') ?? '';
        /* The document's path carries the display name, never a Student ID. */
        expect(text).toContain('001-สมชาย ใจดี/01-ใบสมัคร/transcript-01-เอกสาร.pdf');
      });

      /* A failed build must not leave bytes a later download would serve. */
      it('removes the partial object and records the attempt when a build fails', async () => {
        const repository = new FakeRepository();
        repository.claimedExport = claim();
        const { service, storage } = setup(repository);
        storage.putError = new Error('COLLECTION_EXPORT_PUT_FAILED');

        await expect(service.buildNextExport()).resolves.toBe(true);

        expect(storage.deletedKeys).toContain(`collection-exports/${EXPORT_ID}.xlsx`);
        expect(repository.completedExports).toHaveLength(0);
        expect(repository.failedExports[0]).toMatchObject({
          errorCode: 'COLLECTION_EXPORT_PUT_FAILED',
          exportId: EXPORT_ID,
          leaseId: claim().leaseId,
        });
      });

      /* The lease is what stops a lapsed worker overwriting a newer result. */
      it('completes and fails against the lease it claimed with', async () => {
        const repository = new FakeRepository();
        repository.claimedExport = claim();
        const { service } = setup(repository);

        await service.buildNextExport();

        expect(repository.completedExports[0]?.leaseId).toBe(claim().leaseId);
      });
    });

    describe('cleanup', () => {
      it('deletes an expired artifact and never its source submissions', async () => {
        const repository = new FakeRepository();
        repository.expiredClaim = {
          id: EXPORT_ID,
          storageKey: `collection-exports/${EXPORT_ID}.zip`,
        };
        const { service, storage } = setup(repository);

        await expect(service.cleanUpExpiredExport()).resolves.toBe(true);

        expect(storage.deletedKeys).toEqual([`collection-exports/${EXPORT_ID}.zip`]);
        expect(repository.markedExpired[0]).toMatchObject({ exportId: EXPORT_ID });
      });

      it('reports nothing to clean without writing', async () => {
        const repository = new FakeRepository();
        const { service, storage } = setup(repository);

        await expect(service.cleanUpExpiredExport()).resolves.toBe(false);
        expect(storage.deletedKeys).toHaveLength(0);
        expect(repository.markedExpired).toHaveLength(0);
      });

      /* Retryable: a storage failure must leave the row claimable, not marked gone. */
      it('does not mark an export expired when storage deletion fails', async () => {
        const repository = new FakeRepository();
        repository.expiredClaim = {
          id: EXPORT_ID,
          storageKey: `collection-exports/${EXPORT_ID}.zip`,
        };
        const { service, storage } = setup(repository);
        jest
          .spyOn(storage, 'deleteObject')
          .mockRejectedValueOnce(new Error('COLLECTION_FILE_DELETE_FAILED'));

        await expect(service.cleanUpExpiredExport()).rejects.toThrow();
        expect(repository.markedExpired).toHaveLength(0);
      });
    });
  });
});
