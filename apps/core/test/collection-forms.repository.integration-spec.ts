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
/* A second member exists only so the matrix has an order and a cursor to prove. */
const PEER_PERSON = '58000000-0000-4000-8000-000000000005';
const PEER = '58000000-0000-4000-8000-000000000006';
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
      insert into public.people (id) values (${INSTRUCTOR_PERSON}), (${STUDENT_PERSON}), (${PEER_PERSON})
    `;
    await database.sql`
      insert into public.students (person_id, entry_year, access_ends_academic_year)
      values (${STUDENT_PERSON}, 2569, 2576), (${PEER_PERSON}, 2569, 2576)
    `;
    await database.sql`
      insert into public.accounts (id, person_id, provider_user_id, credential_state, created_at, updated_at)
      values (${INSTRUCTOR}, ${INSTRUCTOR_PERSON}, ${INSTRUCTOR_PERSON}, 'set', ${NOW}, ${NOW}),
        (${STUDENT}, ${STUDENT_PERSON}, ${STUDENT_PERSON}, 'set', ${NOW}, ${NOW}),
        (${PEER}, ${PEER_PERSON}, ${PEER_PERSON}, 'set', ${NOW}, ${NOW})
    `;
    await database.sql`
      insert into public.account_roles (account_id, role)
      values (${INSTRUCTOR}, 'instructor'), (${STUDENT}, 'student'), (${PEER}, 'student')
    `;
    await database.sql`
      insert into private.person_names (person_id, first_name_th, last_name_th)
      values (${INSTRUCTOR_PERSON}, 'ผู้สอน', 'ทดสอบ'), (${STUDENT_PERSON}, 'นักศึกษา', 'ทดสอบ'),
        (${PEER_PERSON}, 'เพื่อนร่วมกลุ่ม', 'ทดสอบ')
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

  describe('structure editing', () => {
    it('replaces an open form definition with optimistic concurrency and audits it', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      const edit = {
        actorAccountId: INSTRUCTOR,
        expectedVersion: form.version,
        fields: [TEXT_FIELD, { ...TEXT_FIELD, id: 'advisor', label: 'อาจารย์ที่ปรึกษา' }],
        formId: form.id,
        now: NOW,
      };
      await expect(repository.updateFormStructure(edit)).resolves.toMatchObject({
        fields: edit.fields,
      });
      const audit = await database.sql<
        { actor_account_id: string; next_version: number; previous_version: number }[]
      >`
        select actor_account_id, previous_version, next_version
        from private.collection_form_structure_events
        where form_id = ${form.id}
        order by occurred_at
      `;
      expect(audit[0]).toEqual({
        actor_account_id: INSTRUCTOR,
        next_version: form.version + 1,
        previous_version: form.version,
      });
      const opened = await repository.openForm({
        actorAccountId: INSTRUCTOR,
        formId: form.id,
        now: NOW,
      });
      if (typeof opened === 'string') throw new Error('expected opened form');
      await expect(
        repository.updateFormStructure({
          ...edit,
          expectedVersion: opened.version,
          fields: [{ ...TEXT_FIELD, label: 'สถานประกอบการ' }],
        }),
      ).resolves.toMatchObject({ fields: [{ label: 'สถานประกอบการ' }], status: 'open' });
      await expect(repository.updateFormStructure(edit)).resolves.toBe('stale');
    });

    it('keeps the submitted field snapshot after the live form changes', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      const opened = await repository.openForm({
        actorAccountId: INSTRUCTOR,
        formId: form.id,
        now: NOW,
      });
      if (typeof opened === 'string') throw new Error('expected opened form');
      await repository.saveDraft({
        answers: { company: 'CSI' },
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      const submitted = await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000099',
        now: NOW,
        studentAccountId: STUDENT,
      });
      if (typeof submitted === 'string' || 'outcome' in submitted) {
        throw new Error('expected submission');
      }

      await repository.updateFormStructure({
        actorAccountId: INSTRUCTOR,
        expectedVersion: opened.version,
        fields: [{ ...TEXT_FIELD, label: 'สถานประกอบการ' }],
        formId: form.id,
        now: new Date(NOW.getTime() + 1_000),
      });

      const history = await repository.getSubmissionHistory({
        actorAccountId: STUDENT,
        formId: form.id,
        isInstructor: false,
        studentAccountId: STUDENT,
      });
      expect(history?.form.fields[0]?.label).toBe('สถานประกอบการ');
      expect(history?.entries[0]?.fields[0]?.label).toBe('บริษัท');
      expect(history?.entries[0]?.formVersion).toBe(opened.version);
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
    const fileFieldId = '58000000-0000-4000-8000-000000000019';
    const fileField: CollectionField = {
      description: '',
      file: { allowedFileTypes: ['pdf'], maxFiles: 2 },
      id: fileFieldId,
      label: 'เอกสาร',
      required: true,
      type: 'file_upload',
    };

    it('stops counting an abandoned ticket after its upload URL expires', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [fileField]);
      const file = await repository.createUpload({
        byteSize: 1_000,
        declaredContentType: 'application/pdf',
        fieldId: fileFieldId,
        filename: 'abandoned.pdf',
        formId: form.id,
        now: NOW,
        storageKey: 'collection-files/58000000-0000-4000-8000-000000000018',
        studentAccountId: STUDENT,
      });

      await expect(
        repository.listFieldFiles({
          fieldId: fileFieldId,
          formId: form.id,
          now: new Date(NOW.getTime() + 16 * 60 * 1_000),
          studentAccountId: STUDENT,
        }),
      ).resolves.toEqual([]);
      expect(file.status).toBe('pending_upload');
    });

    it('keeps a registered upload pending until finalized, then refuses it before inspection', async () => {
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
        fieldId: fileFieldId,
        filename: 'report.pdf',
        formId: form.id,
        now: NOW,
        storageKey: 'collection-files/58000000-0000-4000-8000-000000000020',
        studentAccountId: STUDENT,
      });
      expect(file.status).toBe('pending_upload');
      await expect(
        repository.finalizeUpload({
          fileId: file.id,
          formId: form.id,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe('finalized');
      await expect(
        repository.attachDraftFile({
          fieldId: fileFieldId,
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
      ).resolves.toEqual({ code: 'FILE_NOT_READY', fieldId: fileFieldId, outcome: 'invalid' });
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
        fieldId: fileFieldId,
        filename: 'report.pdf',
        formId: form.id,
        now: NOW,
        storageKey: 'collection-files/58000000-0000-4000-8000-000000000022',
        studentAccountId: STUDENT,
      });
      await repository.finalizeUpload({
        fileId: file.id,
        formId: form.id,
        studentAccountId: STUDENT,
      });
      await repository.attachDraftFile({
        fieldId: fileFieldId,
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
      expect(obligations[0]?.latestSubmission?.files[fileFieldId]?.[0]?.id).toBe(file.id);
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
        fieldId: fileFieldId,
        filename: 'report.pdf',
        formId: form.id,
        now: NOW,
        storageKey: 'collection-files/58000000-0000-4000-8000-000000000024',
        studentAccountId: STUDENT,
      });
      await repository.finalizeUpload({
        fileId: file.id,
        formId: form.id,
        studentAccountId: STUDENT,
      });
      await expect(
        repository.attachDraftFile({
          fieldId: fileFieldId,
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
      await repository.finalizeUpload({
        fileId: file.id,
        formId: form.id,
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

  describe('group matrix', () => {
    it('builds a rectangular grid and separates not_required from not_submitted', async () => {
      const groupId = await createGroup();
      const assigned = await createForm(groupId, [TEXT_FIELD], null, 'มอบหมายแล้ว');
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: assigned.id, now: NOW });

      /* Added after the form opened, so this member owes nothing on it. */
      await addMember(groupId, PEER);
      const later = await createForm(
        groupId,
        [TEXT_FIELD],
        null,
        'เปิดภายหลัง',
        new Date('2026-09-22T11:00:00.000Z'),
      );
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: later.id, now: NOW });

      const page = await repository.readGroupMatrix({
        afterStudentAccountId: null,
        groupId,
        limit: 100,
      });
      if (page === null) throw new Error('expected matrix');

      expect(page.forms.map((form) => form.id)).toEqual([assigned.id, later.id]);
      expect(page.totalMembers).toBe(2);
      expect(page.nextCursor).toBeNull();
      expect(page.rows).toHaveLength(2);
      for (const row of page.rows) expect(row.cells).toHaveLength(2);

      const peer = page.rows.find((row) => row.studentAccountId === PEER);
      expect(peer?.cells[0]).toMatchObject({ isLate: false, status: 'not_required' });
      expect(peer?.cells[1]).toMatchObject({ isLate: false, status: 'not_submitted' });
      expect(page.summary).toMatchObject({ notRequired: 1, notSubmitted: 3 });
    });

    it('omits draft forms so an unopened form never reads as missing work', async () => {
      const groupId = await createGroup();
      await createForm(groupId, [TEXT_FIELD], null, 'ฉบับร่าง');

      const page = await repository.readGroupMatrix({
        afterStudentAccountId: null,
        groupId,
        limit: 100,
      });
      expect(page?.forms).toEqual([]);
      expect(page?.rows[0]?.cells).toEqual([]);
    });

    it('derives lateness from the form deadline rather than a stored stamp', async () => {
      const groupId = await createGroup();
      const deadline = new Date('2026-09-21T17:00:00.000Z');
      const form = await createForm(groupId, [TEXT_FIELD], deadline);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.saveDraft({
        answers: { company: 'CSI' },
        expectedVersion: 0,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      const late = new Date('2026-09-22T09:00:00.000Z');
      const submitted = await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000020',
        now: late,
        studentAccountId: STUDENT,
      });
      expect(submitted).toMatchObject({ version: 1 });

      const before = await repository.readGroupMatrix({
        afterStudentAccountId: null,
        groupId,
        limit: 100,
      });
      expect(before?.rows[0]?.cells[0]).toMatchObject({
        isLate: true,
        status: 'awaiting_checking',
      });
      expect(before?.summary.late).toBe(1);

      /* Extending the deadline must clear lateness without rewriting a row. */
      await repository.updateFormMetadata({
        actorAccountId: INSTRUCTOR,
        deadlineAt: new Date('2026-09-30T17:00:00.000Z'),
        description: '',
        formId: form.id,
        now: NOW,
        title: 'แบบฟอร์ม',
      });
      const after = await repository.readGroupMatrix({
        afterStudentAccountId: null,
        groupId,
        limit: 100,
      });
      expect(after?.rows[0]?.cells[0]).toMatchObject({ isLate: false });
      expect(after?.summary.late).toBe(0);
    });

    it('pages by name and account id without skipping or repeating a member', async () => {
      const groupId = await createGroup();
      await addMember(groupId, PEER);

      const first = await repository.readGroupMatrix({
        afterStudentAccountId: null,
        groupId,
        limit: 1,
      });
      expect(first?.rows.map((row) => row.studentAccountId)).toEqual([STUDENT]);
      expect(first?.nextCursor).toBe(STUDENT);
      /* Totals describe the group, not the page. */
      expect(first?.totalMembers).toBe(2);

      const second = await repository.readGroupMatrix({
        afterStudentAccountId: first?.nextCursor ?? null,
        groupId,
        limit: 1,
      });
      expect(second?.rows.map((row) => row.studentAccountId)).toEqual([PEER]);
      expect(second?.nextCursor).toBeNull();
    });

    it('keeps a withdrawn member visible and marks the row withdrawn', async () => {
      const groupId = await createGroup();
      await database.sql`
        update public.collection_group_memberships
        set status = 'withdrawn', withdrawn_by_account_id = ${INSTRUCTOR}, withdrawn_at = ${NOW},
          withdrawal_reason = 'ลาออก'
        where group_id = ${groupId} and student_account_id = ${STUDENT}
      `;

      const page = await repository.readGroupMatrix({
        afterStudentAccountId: null,
        groupId,
        limit: 100,
      });
      expect(page?.rows).toHaveLength(1);
      expect(page?.rows[0]?.isWithdrawn).toBe(true);
      expect(page?.totalMembers).toBe(1);
    });

    it('returns null for a group that does not exist', async () => {
      await expect(
        repository.readGroupMatrix({
          afterStudentAccountId: null,
          groupId: '58000000-0000-4000-8000-0000000000ff',
          limit: 100,
        }),
      ).resolves.toBeNull();
    });
  });

  /* Submits without checking, so the notification under test is the only one. */
  async function submitOnly(formId: string, idempotencyKey: string) {
    await repository.saveDraft({
      answers: { [TEXT_FIELD.id]: 'คำตอบ' },
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
    return submitted;
  }

  describe('notifications', () => {
    it('tells a Student about an obligation the moment opening a form creates it', async () => {
      const groupId = await createGroup();
      await addMember(groupId, PEER);
      const form = await createForm(groupId, [TEXT_FIELD]);

      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      const feed = await repository.readNotificationFeed({ limit: 50, studentAccountId: STUDENT });
      expect(feed.unreadCount).toBe(1);
      expect(feed.notifications[0]).toMatchObject({
        formId: form.id,
        formTitle: 'แบบฟอร์ม',
        isRead: false,
        kind: 'obligation_assigned',
      });
    });

    /* One Student's feed is their own. The query is what keeps it that way. */
    it('never shows one Student another Student notification', async () => {
      const groupId = await createGroup();
      await addMember(groupId, PEER);
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      const peerFeed = await repository.readNotificationFeed({ limit: 50, studentAccountId: PEER });
      expect(peerFeed.notifications).toHaveLength(1);
      expect(peerFeed.notifications.every((notification) => notification.formId === form.id)).toBe(
        true,
      );
    });

    it('records a decision once however many times the same check is retried', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const submission = await submitOnly(form.id, '58000000-0000-4000-8000-000000000090');
      await repository.checkSubmission({
        actorAccountId: INSTRUCTOR,
        decision: 'passed',
        expectedSubmissionId: submission.submissionId,
        now: NOW,
        reason: null,
      });

      /* A duplicate delivery of the same decision is suppressed by the index. */
      const recorded = await repository.recordNotifications({
        notifications: [
          {
            formId: form.id,
            kind: 'submission_passed',
            studentAccountId: STUDENT,
            subjectKey: submission.submissionId,
          },
        ],
        now: NOW,
      });

      expect(recorded).toBe(0);
      const feed = await repository.readNotificationFeed({ limit: 50, studentAccountId: STUDENT });
      const passed = feed.notifications.filter(
        (notification) => notification.kind === 'submission_passed',
      );
      expect(passed).toHaveLength(1);
    });

    it('suppresses a queued notification once the round has closed', async () => {
      const { groupId, roundId } = await createRoundAndGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.setRoundStatus({
        actorAccountId: INSTRUCTOR,
        expectedStatus: 'active',
        nextStatus: 'closed',
        now: NOW,
        reason: 'ปิดรอบ',
        roundId,
      });

      const recorded = await repository.recordNotifications({
        notifications: [
          {
            formId: form.id,
            kind: 'deadline_reminder',
            studentAccountId: STUDENT,
            subjectKey: '3',
          },
        ],
        now: NOW,
      });

      expect(recorded).toBe(0);
    });

    it('suppresses a queued notification for a withdrawn member', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await database.sql`
        update public.collection_group_memberships
        set status = 'withdrawn', withdrawn_at = ${NOW},
          withdrawn_by_account_id = ${INSTRUCTOR}, withdrawal_reason = 'ลาออก'
        where group_id = ${groupId} and student_account_id = ${STUDENT}
      `;

      const recorded = await repository.recordNotifications({
        notifications: [
          {
            formId: form.id,
            kind: 'deadline_reminder',
            studentAccountId: STUDENT,
            subjectKey: '3',
          },
        ],
        now: NOW,
      });

      expect(recorded).toBe(0);
    });

    it('finds a reminder once its lead time is reached and not before', async () => {
      const groupId = await createGroup();
      const deadline = new Date('2026-09-30T17:00:00.000Z');
      const form = await createForm(groupId, [TEXT_FIELD], deadline);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      const tooEarly = await repository.findDueReminders({
        limit: 200,
        now: new Date('2026-09-26T17:00:00.000Z'),
      });
      expect(tooEarly).toHaveLength(0);

      const due = await repository.findDueReminders({
        limit: 200,
        now: new Date('2026-09-27T18:00:00.000Z'),
      });
      expect(due).toEqual([
        { formId: form.id, kind: 'deadline_reminder', studentAccountId: STUDENT, subjectKey: '3' },
      ]);
    });

    /* Reminding someone after the deadline has passed is noise, not a reminder. */
    it('stops finding a reminder once the deadline has passed', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], new Date('2026-09-30T17:00:00.000Z'));
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      await expect(
        repository.findDueReminders({ limit: 200, now: new Date('2026-10-01T00:00:00.000Z') }),
      ).resolves.toHaveLength(0);
    });

    it('stops finding a reminder once the Student has submitted', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], new Date('2026-09-30T17:00:00.000Z'));
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      /* Both lead times have come due by now, which is why this asserts on both. */
      const now = new Date('2026-09-29T18:00:00.000Z');
      await expect(repository.findDueReminders({ limit: 200, now })).resolves.toHaveLength(2);

      await submitOnly(form.id, '58000000-0000-4000-8000-000000000091');

      await expect(repository.findDueReminders({ limit: 200, now })).resolves.toHaveLength(0);
    });

    it('stops finding a reminder it has already delivered', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], new Date('2026-09-30T17:00:00.000Z'));
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const now = new Date('2026-09-29T18:00:00.000Z');
      const due = await repository.findDueReminders({ limit: 200, now });
      expect(await repository.recordNotifications({ notifications: due, now })).toBe(due.length);

      const remaining = await repository.findDueReminders({ limit: 200, now });
      expect(remaining.some((reminder) => reminder.subjectKey === '3')).toBe(false);
    });

    it('marks only the caller own notifications read', async () => {
      const groupId = await createGroup();
      await addMember(groupId, PEER);
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const peerFeed = await repository.readNotificationFeed({ limit: 50, studentAccountId: PEER });
      const peerNotificationId = peerFeed.notifications[0]?.id ?? '';

      const readCount = await repository.markNotificationsRead({
        notificationIds: [peerNotificationId],
        now: NOW,
        studentAccountId: STUDENT,
      });

      expect(readCount).toBe(0);
      await expect(
        repository.readNotificationFeed({ limit: 50, studentAccountId: PEER }),
      ).resolves.toMatchObject({ unreadCount: 1 });
    });

    it('marks a notification read once and does not count it again', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const feed = await repository.readNotificationFeed({ limit: 50, studentAccountId: STUDENT });
      const notificationId = feed.notifications[0]?.id ?? '';

      await expect(
        repository.markNotificationsRead({
          notificationIds: [notificationId],
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe(1);
      await expect(
        repository.markNotificationsRead({
          notificationIds: [notificationId],
          now: NOW,
          studentAccountId: STUDENT,
        }),
      ).resolves.toBe(0);
      await expect(
        repository.readNotificationFeed({ limit: 50, studentAccountId: STUDENT }),
      ).resolves.toMatchObject({ unreadCount: 0 });
    });
  });

  describe('exports', () => {
    const LEASE = { leaseSeconds: 600, maxAttempts: 3, now: NOW };

    /*
     * The freeze is the whole point of snapshotting at creation: an Instructor
     * who exports on Friday must get Friday's picture even if the worker runs
     * on Monday and a Student submitted over the weekend.
     */
    it('freezes the submission each Student had when the export was requested', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      const opened = await repository.openForm({
        actorAccountId: INSTRUCTOR,
        formId: form.id,
        now: NOW,
      });
      if (typeof opened === 'string') throw new Error('expected opened form');
      const first = await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000060');
      await repository.updateFormStructure({
        actorAccountId: INSTRUCTOR,
        expectedVersion: opened.version,
        fields: [{ ...TEXT_FIELD, label: 'สถานประกอบการ' }],
        formId: form.id,
        now: new Date(NOW.getTime() + 1_000),
      });

      const job = await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'excel',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });
      if (job === null) throw new Error('expected export');

      /* A newer submission lands after the snapshot was taken. */
      await repository.saveDraft({
        answers: { company: 'CSI ใหม่' },
        expectedVersion: 1,
        formId: form.id,
        now: NOW,
        studentAccountId: STUDENT,
      });
      const later = await repository.submit({
        formId: form.id,
        idempotencyKey: '58000000-0000-4000-8000-000000000061',
        now: NOW,
        studentAccountId: STUDENT,
      });
      if (typeof later === 'string' || 'outcome' in later) throw new Error('expected submission');

      const claimed = await repository.claimExportForBuilding(LEASE);
      expect(claimed?.id).toBe(job.id);
      const entry = claimed?.entries.find((row) => row.studentAccountId === STUDENT);
      expect(entry?.submissionId).toBe(first.submissionId);
      expect(entry?.submissionId).not.toBe(later.submissionId);
      expect(claimed?.forms[0]?.fields[0]?.label).toBe('สถานประกอบการ');
      expect(entry?.fields?.[0]?.label).toBe('บริษัท');
      await expect(repository.readSubmissionAnswers(first.submissionId)).resolves.toEqual({
        company: 'CSI',
      });
    });

    /* A rename after the request must not rewrite a workbook already promised. */
    it('copies the form title into the snapshot so a later rename cannot change it', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD], null, 'ชื่อเดิม');
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      const job = await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'excel',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });
      if (job === null) throw new Error('expected export');
      await repository.updateFormMetadata({
        actorAccountId: INSTRUCTOR,
        deadlineAt: null,
        description: '',
        formId: form.id,
        now: NOW,
        title: 'ชื่อใหม่',
      });

      const claimed = await repository.claimExportForBuilding(LEASE);
      expect(claimed?.forms[0]?.title).toBe('ชื่อเดิม');
    });

    /*
     * A draft is not an answer the Student has stood behind, so it must never
     * reach an export even though the row exists.
     */
    it('records no submission for a Student who has only a draft', async () => {
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

      const job = await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'excel',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });
      if (job === null) throw new Error('expected export');

      const claimed = await repository.claimExportForBuilding(LEASE);
      const entry = claimed?.entries.find((row) => row.studentAccountId === STUDENT);
      expect(entry?.submissionId).toBeNull();
      expect(entry?.submittedAt).toBeNull();
    });

    /* Two workers must never build the same archive twice. */
    it('gives one claim to one worker and leaves nothing for the next', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'zip',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });

      const first = await repository.claimExportForBuilding(LEASE);
      const second = await repository.claimExportForBuilding(LEASE);

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    /*
     * A worker whose lease lapsed has lost the job: letting it complete would
     * overwrite whatever the worker that took over produced.
     */
    it('refuses a completion from a lease that is no longer held', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const job = await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'excel',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });
      if (job === null) throw new Error('expected export');
      const claimed = await repository.claimExportForBuilding(LEASE);
      if (claimed === null) throw new Error('expected claim');

      await expect(
        repository.completeExport({
          byteSize: 10,
          expiresAt: new Date(NOW.getTime() + 86_400_000),
          exportId: job.id,
          leaseId: '58000000-0000-4000-8000-0000000000ff',
          now: NOW,
          storageKey: `collection-exports/${job.id}.xlsx`,
        }),
      ).resolves.toBe(false);
      await expect(
        repository.completeExport({
          byteSize: 10,
          expiresAt: new Date(NOW.getTime() + 86_400_000),
          exportId: job.id,
          leaseId: claimed.leaseId,
          now: NOW,
          storageKey: `collection-exports/${job.id}.xlsx`,
        }),
      ).resolves.toBe(true);
      await expect(repository.getExport(job.id)).resolves.toMatchObject({ status: 'ready' });
    });

    /*
     * A retry must rebuild the same artifact, so the snapshot has to survive
     * the failed attempt rather than being retaken from live data.
     */
    it('returns a failed attempt to pending with its snapshot intact, then fails for good', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const submitted = await submitAndReturn(form.id, '58000000-0000-4000-8000-000000000062');
      const job = await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'zip',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });
      if (job === null) throw new Error('expected export');

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const claimed = await repository.claimExportForBuilding(LEASE);
        if (claimed === null) throw new Error(`expected claim on attempt ${attempt}`);
        expect(claimed.entries.find((row) => row.studentAccountId === STUDENT)?.submissionId).toBe(
          submitted.submissionId,
        );
        await expect(
          repository.failExportAttempt({
            errorCode: 'COLLECTION_EXPORT_BUILD_FAILED',
            exportId: job.id,
            leaseId: claimed.leaseId,
            maxAttempts: 3,
            now: NOW,
          }),
        ).resolves.toBe(true);
      }

      await expect(repository.getExport(job.id)).resolves.toMatchObject({
        errorCode: 'COLLECTION_EXPORT_BUILD_FAILED',
        status: 'failed',
      });
      /* A job that failed for good is not handed out again. */
      await expect(repository.claimExportForBuilding(LEASE)).resolves.toBeNull();
    });

    /* A Student removed from the group is no longer someone the group reports on. */
    it('snapshots only current members', async () => {
      const groupId = await createGroup();
      await addMember(groupId, PEER);
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      await database.sql`
        delete from public.collection_group_memberships
        where group_id = ${groupId} and student_account_id = ${PEER}
      `;
      await database.sql`
        delete from public.collection_obligations
        where form_id = ${form.id} and student_account_id = ${PEER}
      `;

      const job = await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'excel',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });
      if (job === null) throw new Error('expected export');

      const claimed = await repository.claimExportForBuilding(LEASE);
      expect(claimed?.entries.map((row) => row.studentAccountId)).toEqual([STUDENT]);
    });

    /* Refusing is safer than truncating: a sheet silently missing Students lies. */
    it('refuses a snapshot larger than the limit rather than trimming it', async () => {
      const groupId = await createGroup();
      await addMember(groupId, PEER);
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });

      await expect(
        repository.createExport({
          formIds: [form.id],
          groupId,
          kind: 'excel',
          maxForms: 30,
          maxStudents: 1,
          now: NOW,
          requestedByAccountId: INSTRUCTOR,
        }),
      ).rejects.toThrow();
      /* The refusal leaves no half-created job behind. */
      await expect(repository.listGroupExports({ groupId, limit: 20 })).resolves.toEqual([]);
    });

    it('returns null for an export requested against a group that does not exist', async () => {
      await expect(
        repository.createExport({
          formIds: ['58000000-0000-4000-8000-0000000000aa'],
          groupId: '58000000-0000-4000-8000-0000000000ab',
          kind: 'excel',
          maxForms: 30,
          maxStudents: 1_000,
          now: NOW,
          requestedByAccountId: INSTRUCTOR,
        }),
      ).resolves.toBeNull();
    });

    /*
     * Expiry is a recorded instant, so a cleanup sweep that runs late deletes
     * the artifact without ever extending the window it was downloadable in.
     */
    it('claims only exports whose recorded expiry has passed and marks them expired', async () => {
      const groupId = await createGroup();
      const form = await createForm(groupId, [TEXT_FIELD]);
      await repository.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
      const job = await repository.createExport({
        formIds: [form.id],
        groupId,
        kind: 'excel',
        maxForms: 30,
        maxStudents: 1_000,
        now: NOW,
        requestedByAccountId: INSTRUCTOR,
      });
      if (job === null) throw new Error('expected export');
      const claimed = await repository.claimExportForBuilding(LEASE);
      if (claimed === null) throw new Error('expected claim');
      const expiresAt = new Date(NOW.getTime() + 86_400_000);
      const storageKey = `collection-exports/${job.id}.xlsx`;
      await repository.completeExport({
        byteSize: 128,
        expiresAt,
        exportId: job.id,
        leaseId: claimed.leaseId,
        now: NOW,
        storageKey,
      });

      /* Still inside the window: nothing to sweep. */
      await expect(
        repository.claimExpiredExport({ now: new Date(expiresAt.getTime() - 1_000) }),
      ).resolves.toBeNull();

      const after = new Date(expiresAt.getTime() + 1_000);
      await expect(repository.claimExpiredExport({ now: after })).resolves.toEqual({
        id: job.id,
        storageKey,
      });
      await repository.markExportExpired({ exportId: job.id, now: after });
      await expect(repository.getExport(job.id)).resolves.toMatchObject({ status: 'expired' });
      await expect(repository.claimExpiredExport({ now: after })).resolves.toBeNull();
    });
  });

  async function addMember(groupId: string, studentAccountId: string) {
    await database.sql`
      insert into public.collection_group_memberships
        (group_id, student_account_id, membership_source, added_by_account_id, added_at)
      values (${groupId}, ${studentAccountId}, 'individual', ${INSTRUCTOR}, ${NOW})
    `;
  }

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
    now: Date = NOW,
  ) {
    const form = await repository.createForm({
      actorAccountId: INSTRUCTOR,
      createdFromTemplateId: null,
      deadlineAt,
      description: '',
      fields,
      groupId,
      now,
      title,
    });
    if (form === null) throw new Error('expected form');
    return form;
  }

  async function cleanupCollectionData() {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.collection_export_entries
        where export_id in (
          select id from private.collection_exports where requested_by_account_id = ${INSTRUCTOR}
        )
      `;
      await transaction`
        delete from private.collection_export_forms
        where export_id in (
          select id from private.collection_exports where requested_by_account_id = ${INSTRUCTOR}
        )
      `;
      await transaction`delete from private.collection_exports where requested_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_checking_events where instructor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_draft_files where student_account_id = ${STUDENT}`;
      await transaction`
        delete from private.collection_submission_files
        where file_id in (select id from private.collection_files where student_account_id = ${STUDENT})
      `;
      await transaction`delete from private.collection_files where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_response_drafts where student_account_id = ${STUDENT}`;
      await transaction`update public.collection_obligations set latest_submission_id = null where student_account_id in (${STUDENT}, ${PEER})`;
      await transaction`delete from private.collection_submissions where student_account_id = ${STUDENT}`;
      await transaction`delete from public.collection_obligations where student_account_id in (${STUDENT}, ${PEER})`;
      await transaction`delete from private.collection_notifications where student_account_id in (${STUDENT}, ${PEER})`;
      await transaction`delete from private.collection_form_structure_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_form_metadata_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_forms where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_form_templates where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_group_memberships where student_account_id in (${STUDENT}, ${PEER})`;
      await transaction`delete from public.collection_groups where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_round_lifecycle_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_rounds where created_by_account_id = ${INSTRUCTOR}`;
    });
  }

  async function cleanup() {
    await cleanupCollectionData();
    await database.sql.begin(async (transaction) => {
      await transaction`delete from public.account_roles where account_id in (${INSTRUCTOR}, ${STUDENT}, ${PEER})`;
      await transaction`delete from private.person_names where person_id in (${INSTRUCTOR_PERSON}, ${STUDENT_PERSON}, ${PEER_PERSON})`;
      await transaction`delete from public.accounts where id in (${INSTRUCTOR}, ${STUDENT}, ${PEER})`;
      await transaction`delete from public.students where person_id in (${STUDENT_PERSON}, ${PEER_PERSON})`;
      await transaction`delete from public.people where id in (${INSTRUCTOR_PERSON}, ${STUDENT_PERSON}, ${PEER_PERSON})`;
    });
  }
});
