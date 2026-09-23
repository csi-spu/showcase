import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import type { CollectionField } from '../src/modules/collection-forms/application/collection-forms.ports';
import { PostgresCollectionFormsRepository } from '../src/modules/collection-forms/infrastructure/postgres-collection-forms.repository';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const INSTRUCTOR_PERSON = '58000000-0000-4000-8000-000000000001';
const INSTRUCTOR = '58000000-0000-4000-8000-000000000002';
const STUDENT_PERSON = '58000000-0000-4000-8000-000000000003';
const STUDENT = '58000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-09-22T10:00:00.000Z');

const TEXT_FIELD: CollectionField = {
  description: '',
  id: 'company',
  label: 'บริษัท',
  required: true,
  type: 'short_text',
};

describe('PostgresCollectionFormsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresCollectionFormsRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql`
      insert into public.people (id) values (${INSTRUCTOR_PERSON}), (${STUDENT_PERSON})
    `;
    await database.sql`
      insert into public.students (person_id, entry_year, access_ends_academic_year)
      values (${STUDENT_PERSON}, 2569, 2576)
    `;
    await database.sql`
      insert into public.accounts (id, person_id, provider_user_id, credential_state, created_at, updated_at)
      values (${INSTRUCTOR}, ${INSTRUCTOR_PERSON}, ${INSTRUCTOR_PERSON}, 'set', ${NOW}, ${NOW}),
        (${STUDENT}, ${STUDENT_PERSON}, ${STUDENT_PERSON}, 'set', ${NOW}, ${NOW})
    `;
    await database.sql`
      insert into public.account_roles (account_id, role) values (${INSTRUCTOR}, 'instructor'), (${STUDENT}, 'student')
    `;
    await database.sql`
      insert into private.person_names (person_id, first_name_th, last_name_th)
      values (${INSTRUCTOR_PERSON}, 'ผู้สอน', 'ทดสอบ'), (${STUDENT_PERSON}, 'นักศึกษา', 'ทดสอบ')
    `;
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  beforeEach(cleanupCollectionData);

  it('opens a form, autosaves, submits idempotently, and checks the latest submission', async () => {
    const groupId = await createGroup();
    const form = await createForm(groupId, [TEXT_FIELD]);
    await expect(
      repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW }),
    ).resolves.toMatchObject({ status: 'open' });
    await expect(
      repository.saveDraft({
        answers: { company: 'CSI' },
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      }),
    ).resolves.toEqual({ version: 1 });
    const idempotencyKey = '58000000-0000-4000-8000-000000000010';
    const submitted = await repository.submit({
      formId: form.id,
      idempotencyKey,
      now: NOW,
      studentAccountId: STUDENT,
    });
    expect(submitted).toMatchObject({ version: 1 });
    await expect(
      repository.submit({ formId: form.id, idempotencyKey, now: NOW, studentAccountId: STUDENT }),
    ).resolves.toEqual(submitted);
    if (typeof submitted === 'string' || 'outcome' in submitted) {
      throw new Error('expected submission');
    }
    await expect(
      repository.checkSubmission({
        actorAccountId: INSTRUCTOR,
        decision: 'passed',
        expectedSubmissionId: submitted.submissionId,
        now: NOW,
        reason: null,
      }),
    ).resolves.toBe('checked');
    const obligations = await repository.listStudentObligations(STUDENT, NOW);
    expect(obligations).toHaveLength(1);
    expect(obligations[0]?.status).toBe('passed');
    expect(obligations[0]?.latestSubmission?.answers).toEqual({ company: 'CSI' });
    // The Roster name is read back for display and never typed by the Student.
    expect(obligations[0]?.rosterName).toEqual({
      firstNameTh: 'นักศึกษา',
      lastNameTh: 'ทดสอบ',
    });
  });

  it('carries the reason forward so a returned Student can see what to fix', async () => {
    const groupId = await createGroup();
    const form = await createForm(groupId, [TEXT_FIELD]);
    await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
    await repository.saveDraft({
      answers: { company: 'CSI' },
      expectedVersion: 0,
      formId: form.id,
      now: NOW,
      studentAccountId: STUDENT,
    });
    const submitted = await repository.submit({
      formId: form.id,
      idempotencyKey: '58000000-0000-4000-8000-000000000011',
      now: NOW,
      studentAccountId: STUDENT,
    });
    if (typeof submitted === 'string' || 'outcome' in submitted) {
      throw new Error('expected submission');
    }
    await repository.checkSubmission({
      actorAccountId: INSTRUCTOR,
      decision: 'changes_required',
      expectedSubmissionId: submitted.submissionId,
      now: NOW,
      reason: 'กรุณาระบุชื่อบริษัทเต็ม',
    });
    const obligations = await repository.listStudentObligations(STUDENT, NOW);
    expect(obligations[0]?.status).toBe('changes_required');
    expect(obligations[0]?.latestCheckingReason).toBe('กรุณาระบุชื่อบริษัทเต็ม');
  });

  describe('structure lock', () => {
    it('replaces a draft definition but refuses edits once the form is open', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      const edit = {
        actorAccountId: INSTRUCTOR,
        deadlineAt: null,
        description: '',
        fields: [TEXT_FIELD, { ...TEXT_FIELD, id: 'advisor', label: 'อาจารย์ที่ปรึกษา' }],
        formId: form.id,
        now: NOW,
        title: 'แบบฟอร์ม',
      };
      await expect(repository.updateDraftForm(edit)).resolves.toMatchObject({
        fields: edit.fields,
      });
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await expect(repository.updateDraftForm(edit)).resolves.toBe('not_draft');
    });

    it('extends a deadline and audits it, but refuses to pull it earlier', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], new Date('2026-10-01T00:00:00.000Z'));
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await expect(
        repository.updateFormMetadata({
          actorAccountId: INSTRUCTOR,
          deadlineAt: new Date('2026-09-25T00:00:00.000Z'),
          description: '',
          formId: form.id,
          now: NOW,
          title: 'แบบฟอร์ม',
        }),
      ).resolves.toBe('deadline_earlier');
      await expect(
        repository.updateFormMetadata({
          actorAccountId: INSTRUCTOR,
          deadlineAt: new Date('2026-10-10T00:00:00.000Z'),
          description: 'คำอธิบายใหม่',
          formId: form.id,
          now: NOW,
          title: 'ชื่อใหม่',
        }),
      ).resolves.toMatchObject({ title: 'ชื่อใหม่' });
      const events = await database.sql<{ change_kind: string }[]>`
        select change_kind from private.collection_form_metadata_events
        where form_id = ${form.id} order by change_kind
      `;
      expect(events.map((event) => event.change_kind)).toEqual([
        'deadline',
        'description',
        'title',
      ]);
    });
  });

  it('keeps a form independent of the template it was copied from', async () => {
    const groupId = await createGroup();
    const template = await repository.createTemplate({
      actorAccountId: INSTRUCTOR,
      description: 'คำอธิบาย',
      fields: [TEXT_FIELD],
      name: 'แม่แบบ',
      now: NOW,
    });
    const form = await repository.createForm({
      actorAccountId: INSTRUCTOR,
      createdFromTemplateId: template.id,
      deadlineAt: null,
      description: template.description,
      fields: template.fields,
      groupId,
      now: NOW,
      title: 'จากแม่แบบ',
    });
    await repository.updateTemplate({
      description: 'คำอธิบายใหม่',
      fields: [{ ...TEXT_FIELD, label: 'ชื่อบริษัทใหม่' }],
      name: 'แม่แบบใหม่',
      now: NOW,
      templateId: template.id,
    });
    const reloaded = await repository.getForm(form!.id);
    expect(reloaded?.fields[0]?.label).toBe('บริษัท');
    expect(reloaded?.createdFromTemplateId).toBe(template.id);
  });

  it('offers reusable values only from passed submissions in the same group', async () => {
    const groupId = await createGroup();
    const mapped: CollectionField = { ...TEXT_FIELD, mappingKey: 'company-name' };
    const passedForm = await createForm(groupId, [mapped], null, 'ฟอร์มแรก');
    const targetForm = await createForm(groupId, [mapped], null, 'ฟอร์มที่สอง');

    await repository.openForm({ actorAccountId: INSTRUCTOR, formId: passedForm.id, now: NOW });
    await repository.saveDraft({
      answers: { company: 'CSI' },
      expectedVersion: 0,
      formId: passedForm.id,
      now: NOW,
      studentAccountId: STUDENT,
    });
    const submitted = await repository.submit({
      formId: passedForm.id,
      idempotencyKey: '58000000-0000-4000-8000-000000000012',
      now: NOW,
      studentAccountId: STUDENT,
    });
    if (typeof submitted === 'string' || 'outcome' in submitted) {
      throw new Error('expected submission');
    }

    // Awaiting checking is not yet a source: only a passed submission qualifies.
    await expect(
      repository.listReusableValues({
        excludeFormId: targetForm.id,
        groupId,
        studentAccountId: STUDENT,
      }),
    ).resolves.toEqual([]);

    await repository.checkSubmission({
      actorAccountId: INSTRUCTOR,
      decision: 'passed',
      expectedSubmissionId: submitted.submissionId,
      now: NOW,
      reason: null,
    });
    await expect(
      repository.listReusableValues({
        excludeFormId: targetForm.id,
        groupId,
        studentAccountId: STUDENT,
      }),
    ).resolves.toEqual([
      { fieldType: 'short_text', mappingKey: 'company-name', submittedAt: NOW, value: 'CSI' },
    ]);
  });

  describe('private files', () => {
    const fileField: CollectionField = {
      description: '',
      file: { allowedFileTypes: ['pdf'], maxFiles: 2 },
      id: 'doc',
      label: 'เอกสาร',
      required: true,
      type: 'file_upload',
    };

    it('registers an upload as quarantined and refuses to submit it', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [fileField]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.saveDraft({
        answers: {},
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });

      const file = await repository.createUpload({
        byteSize: 1_000,
        declaredContentType: 'application/pdf',
        fieldId: 'doc',
        filename: 'report.pdf',
        formId: form.id,
        now: NOW,
        storageKey: 'collection-files/58000000-0000-4000-8000-000000000020',
        studentAccountId: STUDENT,
      });
      expect(file.status).toBe('quarantined');
      await expect(
        repository.attachDraftFile({
          fieldId: 'doc',
          fileId: file.id,
          formId: form.id,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe('attached');

      /*
       * No inspector is deployed, so the file stays quarantined and submission
       * refuses it. An unscanned upload must never become an accepted document.
       */
      await expect(
        repository.submit({
          formId: form.id,
          idempotencyKey: '58000000-0000-4000-8000-000000000021',
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toEqual({ code: 'FILE_NOT_READY', fieldId: 'doc', outcome: 'invalid' });
    });

    it('submits once the file has a recorded inspection result', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [fileField]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.saveDraft({
        answers: {},
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      const file = await repository.createUpload({
        byteSize: 1_000,
        declaredContentType: 'application/pdf',
        fieldId: 'doc',
        filename: 'report.pdf',
        formId: form.id,
        now: NOW,
        storageKey: 'collection-files/58000000-0000-4000-8000-000000000022',
        studentAccountId: STUDENT,
      });
      await repository.attachDraftFile({
        fieldId: 'doc',
        fileId: file.id,
        formId: form.id,
        studentAccountId: STUDENT,
      });
      // Drives the real inspection path rather than writing the row by hand.
      const claim = await repository.claimFileForInspection();
      await repository.completeInspection({
        detectedContentType: 'application/pdf',
        errorCode: null,
        fileId: file.id,
        isAccepted: true,
        leaseId: claim!.leaseId,
        now: NOW,
      });

      const submitted = await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000023',
        now: NOW,
        studentAccountId: STUDENT,
      });
      expect(submitted).toMatchObject({ version: 1 });

      const obligations = await repository.listStudentObligations(STUDENT, NOW);
      expect(obligations[0]?.latestSubmission?.files.doc?.[0]?.id).toBe(file.id);
    });

    it('refuses to attach a file that belongs to another form', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [fileField], null, 'ฟอร์ม ก');
      const otherForm = await createForm(groupId, [fileField], null, 'ฟอร์ม ข');
      for (const target of [form, otherForm]) {
        await repository.openForm({ actorAccountId: INSTRUCTOR, formId: target.id, now: NOW });
        await repository.saveDraft({
          answers: {},
          expectedVersion: 0,
          formId: target.id,
          now: NOW,
          studentAccountId: STUDENT,
        });
      }
      const file = await repository.createUpload({
        byteSize: 1_000,
        declaredContentType: 'application/pdf',
        fieldId: 'doc',
        filename: 'report.pdf',
        formId: form.id,
        now: NOW,
        storageKey: 'collection-files/58000000-0000-4000-8000-000000000024',
        studentAccountId: STUDENT,
      });
      await expect(
        repository.attachDraftFile({
          fieldId: 'doc',
          fileId: file.id,
          formId: otherForm.id,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe('not_found');
    });
  });

  describe('review queue', () => {
    it('lists assigned Students with their submitted answers, and nothing before they submit', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.saveDraft({
        answers: { company: 'ยังไม่ส่ง' },
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });

      /* The Student has a draft but has not submitted: the queue shows the
       * obligation, and none of what they typed. */
      const before = await repository.listFormSubmissions(form.id);
      expect(before?.entries).toEqual([
        expect.objectContaining({
          latestSubmission: null,
          rosterName: { firstNameTh: 'นักศึกษา', lastNameTh: 'ทดสอบ' },
          status: 'not_submitted',
          studentAccountId: STUDENT,
        }),
      ]);

      await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000040',
        now: NOW,
        studentAccountId: STUDENT,
      });

      const after = await repository.listFormSubmissions(form.id);
      expect(after?.form.id).toBe(form.id);
      expect(after?.entries[0]).toMatchObject({
        latestSubmission: { answers: { company: 'ยังไม่ส่ง' }, version: 1 },
        status: 'awaiting_checking',
      });
    });

    it('carries the change-request reason so an Instructor sees why it was returned', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.saveDraft({
        answers: { company: 'บริษัท ก' },
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      const submitted = await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000041',
        now: NOW,
        studentAccountId: STUDENT,
      });
      if (typeof submitted !== 'object' || !('submissionId' in submitted)) {
        throw new Error('expected a submission');
      }
      await repository.checkSubmission({
        actorAccountId: INSTRUCTOR,
        decision: 'changes_required',
        expectedSubmissionId: submitted.submissionId,
        now: NOW,
        reason: 'กรุณาแนบเอกสารเพิ่ม',
      });

      const queue = await repository.listFormSubmissions(form.id);
      expect(queue?.entries[0]).toMatchObject({
        latestCheckingReason: 'กรุณาแนบเอกสารเพิ่ม',
        status: 'changes_required',
      });
    });

    it('returns null for a form that does not exist', async () => {
      await expect(
        repository.listFormSubmissions('58000000-0000-4000-8000-0000000000ff'),
      ).resolves.toBeNull();
    });
  });

  describe('inspection lifecycle', () => {
    const fileField: CollectionField = {
      description: '',
      file: { allowedFileTypes: ['pdf'], maxFiles: 2 },
      id: 'doc',
      label: 'เอกสาร',
      required: true,
      type: 'file_upload',
    };

    async function uploadFile(storageKey: string) {
      const groupId = await createGroup();
      const form = await createForm(groupId, [fileField]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.saveDraft({
        answers: {},
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      const file = await repository.createUpload({
        byteSize: 1_000,
        declaredContentType: 'application/pdf',
        fieldId: 'doc',
        filename: 'report.pdf',
        formId: form.id,
        now: NOW,
        storageKey,
        studentAccountId: STUDENT,
      });
      return { file, form };
    }

    it('claims a quarantined file once, so two workers cannot inspect the same bytes', async () => {
      const { file } = await uploadFile('collection-files/58000000-0000-4000-8000-000000000030');

      const claimed = await repository.claimFileForInspection();
      expect(claimed).toMatchObject({ id: file.id, originalFilename: 'report.pdf' });

      /* The queue is now empty: the first claim moved the file out of `quarantined`. */
      await expect(repository.claimFileForInspection()).resolves.toBeNull();
    });

    it('reclaims an expired inspection without letting the stale worker complete it', async () => {
      const { file } = await uploadFile('collection-files/58000000-0000-4000-8000-000000000039');

      const staleClaim = await repository.claimFileForInspection();
      expect(staleClaim).not.toBeNull();
      await database.sql`
        update private.collection_files
        set inspection_lease_expires_at = now() - interval '1 second'
        where id = ${file.id}
      `;

      const replacementClaim = await repository.claimFileForInspection();
      expect(replacementClaim).toMatchObject({ id: file.id });
      expect(replacementClaim?.leaseId).not.toBe(staleClaim?.leaseId);

      await repository.completeInspection({
        detectedContentType: 'application/pdf',
        errorCode: null,
        fileId: file.id,
        isAccepted: true,
        leaseId: staleClaim!.leaseId,
        now: NOW,
      });
      await expect(
        repository.findReadableFile({
          actorAccountId: STUDENT,
          fileId: file.id,
          isInstructor: false,
        }),
      ).resolves.toMatchObject({ status: 'inspecting' });

      await repository.completeInspection({
        detectedContentType: 'application/pdf',
        errorCode: null,
        fileId: file.id,
        isAccepted: true,
        leaseId: replacementClaim!.leaseId,
        now: NOW,
      });
      await expect(
        repository.findReadableFile({
          actorAccountId: STUDENT,
          fileId: file.id,
          isInstructor: false,
        }),
      ).resolves.toMatchObject({ status: 'ready' });
    });

    it('marks an accepted file ready, which is the only way it becomes submittable', async () => {
      const { file, form } = await uploadFile(
        'collection-files/58000000-0000-4000-8000-000000000031',
      );
      await repository.attachDraftFile({
        fieldId: 'doc',
        fileId: file.id,
        formId: form.id,
        studentAccountId: STUDENT,
      });
      const claim = await repository.claimFileForInspection();

      await repository.completeInspection({
        detectedContentType: 'application/pdf',
        errorCode: null,
        fileId: file.id,
        isAccepted: true,
        leaseId: claim!.leaseId,
        now: NOW,
      });

      await expect(
        repository.submit({
          formId: form.id,
          idempotencyKey: '58000000-0000-4000-8000-000000000032',
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toMatchObject({ version: 1 });
    });

    it('records a rejected file as failed and still refuses to submit it', async () => {
      const { file, form } = await uploadFile(
        'collection-files/58000000-0000-4000-8000-000000000033',
      );
      await repository.attachDraftFile({
        fieldId: 'doc',
        fileId: file.id,
        formId: form.id,
        studentAccountId: STUDENT,
      });
      const claim = await repository.claimFileForInspection();

      await repository.completeInspection({
        detectedContentType: null,
        errorCode: 'FILE_TYPE_MISMATCH',
        fileId: file.id,
        isAccepted: false,
        leaseId: claim!.leaseId,
        now: NOW,
      });

      await expect(
        repository.submit({
          formId: form.id,
          idempotencyKey: '58000000-0000-4000-8000-000000000034',
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toEqual({ code: 'FILE_NOT_READY', fieldId: 'doc', outcome: 'invalid' });
    });

    it('fails an accepted verdict that carries no detected type, rather than trusting it', async () => {
      const { file } = await uploadFile('collection-files/58000000-0000-4000-8000-000000000035');
      const claim = await repository.claimFileForInspection();

      await repository.completeInspection({
        detectedContentType: null,
        errorCode: null,
        fileId: file.id,
        isAccepted: true,
        leaseId: claim!.leaseId,
        now: NOW,
      });

      const readable = await repository.findReadableFile({
        actorAccountId: STUDENT,
        fileId: file.id,
        isInstructor: false,
      });
      expect(readable?.status).toBe('failed');
    });

    it('lets the owning Student read their file but never another Student', async () => {
      const { file } = await uploadFile('collection-files/58000000-0000-4000-8000-000000000036');

      await expect(
        repository.findReadableFile({
          actorAccountId: STUDENT,
          fileId: file.id,
          isInstructor: false,
        }),
      ).resolves.toMatchObject({ originalFilename: 'report.pdf' });

      /* A different account must not reach the row at all, not merely be denied later. */
      await expect(
        repository.findReadableFile({
          actorAccountId: INSTRUCTOR_PERSON,
          fileId: file.id,
          isInstructor: false,
        }),
      ).resolves.toBeNull();
    });

    it('hides a draft file from an Instructor until it is actually submitted', async () => {
      const { file, form } = await uploadFile(
        'collection-files/58000000-0000-4000-8000-000000000037',
      );
      await repository.attachDraftFile({
        fieldId: 'doc',
        fileId: file.id,
        formId: form.id,
        studentAccountId: STUDENT,
      });
      const claim = await repository.claimFileForInspection();
      await repository.completeInspection({
        detectedContentType: 'application/pdf',
        errorCode: null,
        fileId: file.id,
        isAccepted: true,
        leaseId: claim!.leaseId,
        now: NOW,
      });

      /* Still a draft: an Instructor has no business reading it yet. */
      await expect(
        repository.findReadableFile({
          actorAccountId: INSTRUCTOR,
          fileId: file.id,
          isInstructor: true,
        }),
      ).resolves.toBeNull();

      await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000038',
        now: NOW,
        studentAccountId: STUDENT,
      });

      await expect(
        repository.findReadableFile({
          actorAccountId: INSTRUCTOR,
          fileId: file.id,
          isInstructor: true,
        }),
      ).resolves.toMatchObject({ originalFilename: 'report.pdf', status: 'ready' });
    });
  });

  /**
   * Drives one obligation to a returned correction, which is the state most of
   * the lifecycle rules below are about.
   */
  async function submitAndReturn(
    formId: string,
    idempotencyKey: string,
    answers: Record<string, string> = { company: 'CSI' },
  ) {
    await repository.saveDraft({
      answers,
      expectedVersion: 0,
      formId,
      now: NOW,
      studentAccountId: STUDENT,
    });
    const submitted = await repository.submit({
      formId,
      idempotencyKey,
      now: NOW,
      studentAccountId: STUDENT,
    });
    if (typeof submitted === 'string' || 'outcome' in submitted) {
      throw new Error('expected submission');
    }
    await repository.checkSubmission({
      actorAccountId: INSTRUCTOR,
      decision: 'changes_required',
      expectedSubmissionId: submitted.submissionId,
      now: NOW,
      reason: 'แก้ไขชื่อบริษัท',
    });
    return submitted;
  }

  describe('first-submission lateness', () => {
    const DEADLINE = new Date('2026-09-22T09:00:00.000Z');

    it('measures lateness from the first submission and recalculates when the deadline moves', async () => {
      const groupId = await createGroup();
      // NOW is 10:00; the deadline is 09:00, so this first submission is late.
      const form = await createForm(groupId, [TEXT_FIELD], DEADLINE);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000040');

      const late = await repository.listStudentObligations(STUDENT, NOW);
      expect(late[0]?.isLate).toBe(true);
      expect(late[0]?.firstSubmittedAt).toEqual(NOW);

      // Extending past the retained first submission makes it on time again.
      await repository.updateFormMetadata({
        actorAccountId: INSTRUCTOR,
        deadlineAt: new Date('2026-09-30T09:00:00.000Z'),
        description: '',
        formId: form.id,
        now: NOW,
        title: 'แบบฟอร์ม',
      });

      const extended = await repository.listStudentObligations(STUDENT, NOW);
      expect(extended[0]?.isLate).toBe(false);
      // The original submission time is retained, not rewritten by the extension.
      expect(extended[0]?.firstSubmittedAt).toEqual(NOW);
    });

    it('reports a passed deadline before anything is submitted', async () => {
      const groupId = await createGroup();
      // NOW is 10:00 and the deadline was 09:00, with nothing submitted yet.
      const form = await createForm(groupId, [TEXT_FIELD], DEADLINE);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      const obligations = await repository.listStudentObligations(STUDENT, NOW);
      /*
       * Lateness describes a submission, so it stays false while none exists.
       * The passed deadline is what the Student has to be told about.
       */
      expect(obligations[0]?.isLate).toBe(false);
      expect(obligations[0]?.firstSubmittedAt).toBeNull();
      expect(obligations[0]?.hasDeadlinePassed).toBe(true);
      // A passed deadline is not a closure: an open form still takes the answer.
      expect(obligations[0]?.isWritable).toBe(true);
    });

    it('does not report a passed deadline while the deadline is still ahead', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], new Date('2026-09-30T09:00:00.000Z'));
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      const obligations = await repository.listStudentObligations(STUDENT, NOW);
      expect(obligations[0]?.hasDeadlinePassed).toBe(false);
    });

    it('does not make an on-time first submission late when a correction arrives later', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], new Date('2026-09-23T09:00:00.000Z'));
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000041');

      await repository.saveDraft({
        answers: { company: 'CSI แก้ไข' },
        expectedVersion: 1,
        formId: form.id,
        now: new Date('2026-09-25T10:00:00.000Z'),
        studentAccountId: STUDENT,
      });
      await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000042',
        now: new Date('2026-09-25T10:00:00.000Z'),
        studentAccountId: STUDENT,
      });

      const obligations = await repository.listStudentObligations(STUDENT, NOW);
      expect(obligations[0]?.isLate).toBe(false);
      expect(obligations[0]?.firstSubmittedAt).toEqual(NOW);
    });

    it('rejects shortening a deadline after opening', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], DEADLINE);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      await expect(
        repository.updateFormMetadata({
          actorAccountId: INSTRUCTOR,
          deadlineAt: new Date('2026-09-21T09:00:00.000Z'),
          description: '',
          formId: form.id,
          now: NOW,
          title: 'แบบฟอร์ม',
        }),
      ).resolves.toBe('deadline_earlier');
    });
  });

  describe('closing and reopening first submissions', () => {
    it('stops first submissions while a requested correction still goes through', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000043');

      await expect(
        repository.closeForm({
          actorAccountId: INSTRUCTOR,
          formId: form.id,
          now: NOW,
          reason: 'หมดเขตรับรอบแรก',
        }),
      ).resolves.toMatchObject({ status: 'closed' });

      // The returned Student can still fix and resend on a closed form.
      await expect(
        repository.saveDraft({
          answers: { company: 'CSI แก้ไข' },
          expectedVersion: 1,
          formId: form.id,
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toEqual({ version: 2 });
      await expect(
        repository.submit({
          formId: form.id,
          idempotencyKey: '58000000-0000-4000-8000-000000000044',
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toMatchObject({ version: 2 });

      const events = await database.sql<{ change_kind: string; reason: string | null }[]>`
        select change_kind, reason from private.collection_form_metadata_events
        where form_id = ${form.id} and change_kind = 'closed'
      `;
      expect(events[0]).toEqual({ change_kind: 'closed', reason: 'หมดเขตรับรอบแรก' });
    });

    it('blocks a first submission once the form is closed', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.saveDraft({
        answers: { company: 'CSI' },
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      await repository.closeForm({
        actorAccountId: INSTRUCTOR,
        formId: form.id,
        now: NOW,
        reason: 'หมดเขต',
      });

      await expect(
        repository.submit({
          formId: form.id,
          idempotencyKey: '58000000-0000-4000-8000-000000000045',
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe('forbidden');
    });

    it('previews and assigns only members without an obligation, preserving prior outcomes', async () => {
      const { groupId } = await createRoundAndGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000046');
      await repository.closeForm({
        actorAccountId: INSTRUCTOR,
        formId: form.id,
        now: NOW,
        reason: 'หมดเขต',
      });

      // The one member already holds an obligation, so a reopen assigns nobody.
      await expect(repository.previewFormReopen(form.id)).resolves.toEqual({
        newlyAssignedCount: 0,
      });
      const reopened = await repository.reopenForm({
        actorAccountId: INSTRUCTOR,
        formId: form.id,
        now: NOW,
        reason: 'เปิดรับเพิ่ม',
      });
      expect(reopened).toMatchObject({ newlyAssignedCount: 0 });

      // Reopening is not a request to submit again: the returned state survives.
      const obligations = await repository.listStudentObligations(STUDENT, NOW);
      expect(obligations[0]?.status).toBe('changes_required');
      expect(obligations[0]?.latestSubmission?.version).toBe(1);
      expect(obligations[0]?.firstSubmittedAt).toEqual(NOW);
    });

    it('refuses to reopen a form that was never closed', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      await expect(repository.previewFormReopen(form.id)).resolves.toBe('not_closed');
      await expect(
        repository.reopenForm({
          actorAccountId: INSTRUCTOR,
          formId: form.id,
          now: NOW,
          reason: 'เปิดรับ',
        }),
      ).resolves.toBe('not_closed');
    });
  });

  describe('round closure', () => {
    it('freezes writes and checking, retains the confirmed counts, and reverses with a reason', async () => {
      const { groupId, roundId } = await createRoundAndGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const submitted = await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000047');

      await expect(repository.getRoundPendingWork(roundId)).resolves.toEqual({
        awaitingChecking: 0,
        changesRequired: 1,
        notSubmitted: 0,
      });

      const closed = await repository.setRoundStatus({
        actorAccountId: INSTRUCTOR,
        expectedStatus: 'active',
        nextStatus: 'closed',
        now: NOW,
        reason: 'สิ้นสุดภาคการศึกษา',
        roundId,
      });
      expect(closed).toEqual({
        pendingWork: { awaitingChecking: 0, changesRequired: 1, notSubmitted: 0 },
      });

      // A closed round is read-only: the correction that a closed *form* would
      // still have allowed is blocked here.
      await expect(
        repository.saveDraft({
          answers: { company: 'CSI แก้ไข' },
          expectedVersion: 1,
          formId: form.id,
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe('forbidden');
      await expect(
        repository.submit({
          formId: form.id,
          idempotencyKey: '58000000-0000-4000-8000-000000000048',
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe('forbidden');
      await expect(
        repository.checkSubmission({
          actorAccountId: INSTRUCTOR,
          decision: 'passed',
          expectedSubmissionId: submitted.submissionId,
          now: NOW,
          reason: null,
        }),
      ).resolves.toBe('round_closed');

      // Closure never turns unfinished work into passed work.
      const duringClosure = await repository.listStudentObligations(STUDENT, NOW);
      expect(duringClosure[0]?.status).toBe('changes_required');
      /*
       * The Student's own view has to agree with the refusals above. Reported
       * as writable, the form renders as editable and the refusal only arrives
       * after they have typed.
       */
      expect(duringClosure[0]?.isWritable).toBe(false);

      // Closing twice is refused, so two Instructors produce one transition.
      await expect(
        repository.setRoundStatus({
          actorAccountId: INSTRUCTOR,
          expectedStatus: 'active',
          nextStatus: 'closed',
          now: NOW,
          reason: 'ปิดซ้ำ',
          roundId,
        }),
      ).resolves.toBe('already_in_state');

      await expect(
        repository.setRoundStatus({
          actorAccountId: INSTRUCTOR,
          expectedStatus: 'closed',
          nextStatus: 'active',
          now: NOW,
          reason: 'ต้องรับเอกสารเพิ่ม',
          roundId,
        }),
      ).resolves.toMatchObject({ pendingWork: { changesRequired: 1 } });

      // Reopening the round restores the write the closure had blocked.
      await expect(
        repository.saveDraft({
          answers: { company: 'CSI แก้ไข' },
          expectedVersion: 1,
          formId: form.id,
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toEqual({ version: 2 });

      const events = await database.sql<
        { action: string; pending_changes_required: number; reason: string }[]
      >`
        select action, reason, pending_changes_required
        from private.collection_round_lifecycle_events
        where round_id = ${roundId} order by occurred_at, action
      `;
      expect(events).toHaveLength(2);
      expect(events.map((event) => event.action).sort()).toEqual(['closed', 'reopened']);
      expect(events.every((event) => event.pending_changes_required === 1)).toBe(true);
    });
  });

  describe('submission history', () => {
    it("retains every version with its decisions and hides another Student's history", async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000049');
      await repository.saveDraft({
        answers: { company: 'CSI แก้ไข' },
        expectedVersion: 1,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      const resubmitted = await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000050',
        now: NOW,
        studentAccountId: STUDENT,
      });
      if (typeof resubmitted === 'string' || 'outcome' in resubmitted) {
        throw new Error('expected submission');
      }
      await repository.checkSubmission({
        actorAccountId: INSTRUCTOR,
        decision: 'passed',
        expectedSubmissionId: resubmitted.submissionId,
        now: NOW,
        reason: null,
      });

      const history = await repository.getSubmissionHistory({
        actorAccountId: STUDENT,
        formId: form.id,
        isInstructor: false,
        studentAccountId: STUDENT,
      });
      expect(history?.entries).toHaveLength(2);
      // Newest first, and the first version keeps exactly what was sent then.
      expect(history?.entries[0]?.version).toBe(2);
      expect(history?.entries[1]?.answers).toEqual({ company: 'CSI' });
      expect(history?.entries[1]?.checkingEvents[0]).toMatchObject({
        decision: 'changes_required',
        instructorName: 'ผู้สอน ทดสอบ',
        reason: 'แก้ไขชื่อบริษัท',
      });
      expect(history?.entries[0]?.checkingEvents[0]?.decision).toBe('passed');

      // An Instructor reads the same submitted history.
      await expect(
        repository.getSubmissionHistory({
          actorAccountId: INSTRUCTOR,
          formId: form.id,
          isInstructor: true,
          studentAccountId: STUDENT,
        }),
      ).resolves.toMatchObject({ status: 'passed' });

      // A Student asking for someone else's history gets nothing to distinguish.
      await expect(
        repository.getSubmissionHistory({
          actorAccountId: INSTRUCTOR,
          formId: form.id,
          isInstructor: false,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBeNull();
    });
  });

  async function createGroup(): Promise<string> {
    return (await createRoundAndGroup()).groupId;
  }

  async function createRoundAndGroup(): Promise<{ groupId: string; roundId: string }> {
    const rounds = await database.sql<{ id: string }[]>`
      insert into public.collection_rounds (name, created_by_account_id, created_at)
      values ('รอบ', ${INSTRUCTOR}, ${NOW}) returning id
    `;
    const groups = await database.sql<{ id: string }[]>`
      insert into public.collection_groups (round_id, name, created_by_account_id, created_at)
      values (${rounds[0]!.id}, 'กลุ่ม', ${INSTRUCTOR}, ${NOW}) returning id
    `;
    await database.sql`
      insert into public.collection_group_memberships
        (group_id, student_account_id, membership_source, added_by_account_id, added_at)
      values (${groups[0]!.id}, ${STUDENT}, 'individual', ${INSTRUCTOR}, ${NOW})
    `;
    return { groupId: groups[0]!.id, roundId: rounds[0]!.id };
  }

  async function createForm(
    groupId: string,
    fields: CollectionField[],
    deadlineAt: Date | null = null,
    title = 'แบบฟอร์ม',
  ) {
    const form = await repository.createForm({
      actorAccountId: INSTRUCTOR,
      createdFromTemplateId: null,
      deadlineAt,
      description: '',
      fields,
      groupId,
      now: NOW,
      title,
    });
    if (form === null) throw new Error('expected form');
    return form;
  }

  async function cleanupCollectionData() {
    await database.sql.begin(async (transaction) => {
      await transaction`delete from private.collection_checking_events where instructor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_draft_files where student_account_id = ${STUDENT}`;
      await transaction`
        delete from private.collection_submission_files
        where file_id in (select id from private.collection_files where student_account_id = ${STUDENT})
      `;
      await transaction`delete from private.collection_files where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_response_drafts where student_account_id = ${STUDENT}`;
      await transaction`update public.collection_obligations set latest_submission_id = null where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_submissions where student_account_id = ${STUDENT}`;
      await transaction`delete from public.collection_obligations where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_form_metadata_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_forms where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_form_templates where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_group_memberships where student_account_id = ${STUDENT}`;
      await transaction`delete from public.collection_groups where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_round_lifecycle_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_rounds where created_by_account_id = ${INSTRUCTOR}`;
    });
  }

  async function cleanup() {
    await cleanupCollectionData();
    await database.sql.begin(async (transaction) => {
      await transaction`delete from public.account_roles where account_id in (${INSTRUCTOR}, ${STUDENT})`;
      await transaction`delete from private.person_names where person_id in (${INSTRUCTOR_PERSON}, ${STUDENT_PERSON})`;
      await transaction`delete from public.accounts where id in (${INSTRUCTOR}, ${STUDENT})`;
      await transaction`delete from public.students where person_id = ${STUDENT_PERSON}`;
      await transaction`delete from public.people where id in (${INSTRUCTOR_PERSON}, ${STUDENT_PERSON})`;
    });
  }
});
