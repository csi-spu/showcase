import type { Clock } from '../../auth/application/auth.ports';
import type { CollectionField } from './collection-field';
import { CollectionFormsService } from './collection-forms.service';
import { CollectionFormsError } from './collection-forms.ports';
import { MAX_MATRIX_ROWS } from './collection-matrix';
import type {
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
  form: CollectionForm | null = FORM;
  formSubmissions: { form: CollectionForm; entries: CollectionReviewEntry[] } | null = {
    entries: [],
    form: FORM,
  };
  metadataResult: Result<'updateFormMetadata'> = { ...FORM, title: 'ชื่อใหม่' };
  openResult: Result<'openForm'> = { ...FORM, status: 'open' };
  reusableValues: ReusableValueCandidate[] = [];
  saveResult: Result<'saveDraft'> = { version: 1 };
  submitResult: Result<'submit'> = {
    submissionId: '50000000-0000-4000-8000-000000000001',
    version: 1,
  };
  template: CollectionFormTemplate | null = TEMPLATE;
  updateDraftResult: Result<'updateDraftForm'> = FORM;

  createdForms: Parameters<CollectionFormsRepository['createForm']>[0][] = [];
  createdTemplates: Parameters<CollectionFormsRepository['createTemplate']>[0][] = [];
  createdUploads: Parameters<CollectionFormsRepository['createUpload']>[0][] = [];
  fieldFiles: CollectionFile[] = [];
  claimable: Result<'claimFileForInspection'> = null;
  completedInspections: Parameters<CollectionFormsRepository['completeInspection']>[0][] = [];
  readableFile: Result<'findReadableFile'> = null;

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
      status: 'quarantined',
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
  getForm(): Promise<CollectionForm | null> {
    return Promise.resolve(this.form);
  }
  getTemplate(): Promise<CollectionFormTemplate | null> {
    return Promise.resolve(this.template);
  }
  listFieldFiles(): Promise<CollectionFile[]> {
    return Promise.resolve(this.fieldFiles);
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
  saveDraft(): Promise<Result<'saveDraft'>> {
    return Promise.resolve(this.saveResult);
  }
  submit(): Promise<Result<'submit'>> {
    return Promise.resolve(this.submitResult);
  }
  updateDraftForm(): Promise<Result<'updateDraftForm'>> {
    return Promise.resolve(this.updateDraftResult);
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
  getObjectResult: Buffer | Error = Buffer.from('%PDF-1.7');
  presignedGets: { expiresInSeconds: number; key: string }[] = [];
  presignedPuts: { contentType: string; expiresInSeconds: number; key: string }[] = [];

  createPresignedPut(input: { contentType: string; expiresInSeconds: number; key: string }) {
    this.presignedPuts.push(input);
    return Promise.resolve(`https://storage.example/put/${input.key}`);
  }
  createPresignedGet(input: { expiresInSeconds: number; key: string }) {
    this.presignedGets.push(input);
    return Promise.resolve(`https://storage.example/get/${input.key}`);
  }
  deleteObject(): Promise<void> {
    return Promise.resolve();
  }
  getObject(): Promise<Buffer> {
    if (this.getObjectResult instanceof Error) return Promise.reject(this.getObjectResult);
    return Promise.resolve(this.getObjectResult);
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

  describe('structure lock', () => {
    it('refuses structural edits once the form has been opened', async () => {
      const repository = new FakeRepository();
      repository.updateDraftResult = 'not_draft';
      await expect(
        setup(repository).service.updateDraftForm({
          actorAccountId: ACTOR,
          deadlineAt: null,
          description: '',
          fields: FORM.fields,
          formId: FORM.id,
          title: 'แบบฟอร์ม',
        }),
      ).rejects.toEqual(new CollectionFormsError('FORM_STRUCTURE_LOCKED', 409));
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

    it('registers the upload as quarantined, never as accepted', async () => {
      const repository = new FakeRepository();
      repository.form = fileForm;
      const { file } = await setup(repository).service.createUpload(request);
      expect(file.status).toBe('quarantined');
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
              files: {},
              id: '50000000-0000-4000-8000-000000000009',
              submittedAt: NOW,
              version: 1,
            },
            rosterName: { firstNameTh: 'นักศึกษา', lastNameTh: 'ทดสอบ' },
            status: 'awaiting_checking',
            studentAccountId: STUDENT,
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
});
