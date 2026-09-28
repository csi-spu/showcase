import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AuthError } from '../src/modules/auth/application/auth.error';
import { InstructorAuthService } from '../src/modules/auth/application/instructor-auth.service';
import { StudentCollectionAuthService } from '../src/modules/auth/application/student-collection-auth.service';
import { CollectionFormsService } from '../src/modules/collection-forms/application/collection-forms.service';
import { CollectionFormsError } from '../src/modules/collection-forms/application/collection-forms.ports';

const INSTRUCTOR_ACCOUNT = '58000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT = '58000000-0000-4000-8000-000000000002';
const OTHER_STUDENT_ACCOUNT = '58000000-0000-4000-8000-000000000003';
const FORM_ID = '58000000-0000-4000-8000-000000000004';
const ROUND_ID = '58000000-0000-4000-8000-000000000005';
const SUBMISSION_ID = '58000000-0000-4000-8000-000000000006';
const NOTIFICATION_ID = '58000000-0000-4000-8000-000000000007';
const GROUP_ID = '58000000-0000-4000-8000-000000000008';
const EXPORT_ID = '58000000-0000-4000-8000-000000000009';

/*
 * Transport boundaries for the correction, lateness and lifecycle routes.
 *
 * The application service is replaced so these assertions stay about the edge:
 * who is let through, what a rejected body does, and exactly which values leave
 * the process. Domain behaviour is covered by the unit and repository suites.
 */
describe('collection forms lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let instructorAuthorized: boolean;
  let studentAuthorized: boolean;
  /*
   * Read from the running configuration rather than written here, so the suite
   * does not carry a copy of a shared secret and does not break when a local
   * environment sets its own.
   */
  let instructorSecret: string;
  let studentSecret: string;

  const history = {
    entries: [
      {
        answers: { company: 'CSI' },
        checkingEvents: [
          {
            decision: 'changes_required' as const,
            instructorName: 'อาจารย์สมหญิง',
            occurredAt: new Date('2026-09-20T03:00:00.000Z'),
            reason: 'แก้ไขชื่อบริษัท',
          },
        ],
        files: {},
        id: SUBMISSION_ID,
        submittedAt: new Date('2026-09-20T02:00:00.000Z'),
        version: 1,
      },
    ],
    firstSubmittedAt: new Date('2026-09-20T02:00:00.000Z'),
    form: {
      deadlineAt: new Date('2026-09-25T16:59:59.000Z'),
      fields: [],
      id: FORM_ID,
      status: 'open' as const,
      title: 'แบบฟอร์มสหกิจศึกษา',
    },
    isLate: false,
    status: 'changes_required' as const,
  };

  const exportJob = {
    byteSize: 2_048,
    errorCode: null,
    expiresAt: new Date('2026-09-24T03:00:00.000Z'),
    groupId: GROUP_ID,
    id: EXPORT_ID,
    kind: 'excel' as const,
    readyAt: new Date('2026-09-23T03:00:00.000Z'),
    requestedAt: new Date('2026-09-23T02:59:00.000Z'),
    /* Present on the domain object and deliberately absent from the view. */
    requestedByAccountId: INSTRUCTOR_ACCOUNT,
    status: 'ready' as const,
  };

  const forms = {
    createExport: jest.fn().mockResolvedValue({ ...exportJob, status: 'pending' }),
    createExportDownload: jest
      .fn()
      .mockResolvedValue({ url: 'https://media.internal/objects/abc?expires=1&signature=x' }),
    getExport: jest.fn().mockResolvedValue(exportJob),
    listGroupExports: jest.fn().mockResolvedValue([exportJob]),
    closeForm: jest.fn().mockResolvedValue({ id: FORM_ID, status: 'closed' }),
    closeRound: jest.fn().mockResolvedValue({ pendingWork: pendingWork() }),
    getFormHistory: jest.fn().mockResolvedValue({
      entries: [
        {
          actorName: 'อาจารย์สมหญิง',
          changes: [
            { kind: 'title_changed', next: 'แบบฟอร์มใหม่', previous: 'แบบฟอร์ม' },
            { kind: 'question_added', label: 'บริษัท' },
          ],
          id: SUBMISSION_ID,
          occurredAt: new Date('2026-09-20T03:00:00.000Z'),
        },
      ],
      nextCursor: 'bmV4dC1wYWdl',
    }),
    getRoundPendingWork: jest.fn().mockResolvedValue({ ...pendingWork(), total: 3 }),
    getSubmissionHistory: jest.fn().mockResolvedValue(history),
    previewFormReopen: jest.fn().mockResolvedValue({ newlyAssignedCount: 2 }),
    reopenForm: jest
      .fn()
      .mockResolvedValue({ form: { id: FORM_ID, status: 'open' }, newlyAssignedCount: 2 }),
    reopenRound: jest.fn().mockResolvedValue({ pendingWork: pendingWork() }),
    saveForm: jest.fn().mockResolvedValue({ id: FORM_ID, version: 3 }),
    updateFormStructure: jest.fn().mockResolvedValue({ id: FORM_ID, version: 3 }),
    markNotificationsRead: jest.fn().mockResolvedValue({ readCount: 1 }),
    readNotificationFeed: jest.fn().mockResolvedValue({
      notifications: [
        {
          createdAt: new Date('2026-09-23T03:00:00.000Z'),
          deadlineAt: new Date('2026-09-25T16:59:59.000Z'),
          formId: FORM_ID,
          formTitle: 'แบบฟอร์มสหกิจศึกษา',
          groupId: ROUND_ID,
          id: NOTIFICATION_ID,
          isRead: false,
          kind: 'deadline_reminder' as const,
          studentAccountId: STUDENT_ACCOUNT,
        },
      ],
      unreadCount: 1,
    }),
  };

  beforeEach(async () => {
    instructorAuthorized = true;
    studentAuthorized = true;
    jest.clearAllMocks();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InstructorAuthService)
      .useValue({
        authorizeInstructor: () => {
          if (!instructorAuthorized) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: INSTRUCTOR_ACCOUNT });
        },
      })
      .overrideProvider(StudentCollectionAuthService)
      .useValue({
        authorizeMutation: () => {
          if (!studentAuthorized) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: STUDENT_ACCOUNT });
        },
        authorizeRead: () => {
          if (!studentAuthorized) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: STUDENT_ACCOUNT });
        },
      })
      .overrideProvider(CollectionFormsService)
      .useValue(forms)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
    const config = app.get(ConfigService);
    instructorSecret = config.getOrThrow<string>('INSTRUCTOR_BFF_SECRET');
    studentSecret = config.getOrThrow<string>('STUDENT_COLLECTION_BFF_SECRET');
  });

  afterEach(async () => app.close());

  describe('audience boundaries', () => {
    it('refuses an Instructor route without the Instructor BFF secret', async () => {
      await request(app.getHttpServer())
        .get(`/v1/internal/instructor/collection/rounds/${ROUND_ID}/pending-work`)
        .set('Authorization', 'Bearer opaque-session')
        .expect(403);
      expect(forms.getRoundPendingWork).not.toHaveBeenCalled();
    });

    it('refuses a Student route without the Student collection BFF secret', async () => {
      await request(app.getHttpServer())
        .get(`/v1/internal/student-collection/forms/${FORM_ID}/history`)
        .set('Authorization', 'Bearer opaque-session')
        .expect(403);
      expect(forms.getSubmissionHistory).not.toHaveBeenCalled();
    });

    it('does not expose Instructor lifecycle commands on the Student surface', async () => {
      await studentRequest('post', `forms/${FORM_ID}/close`).send({ reason: 'ปิดรับ' }).expect(404);
      await studentRequest('post', `rounds/${ROUND_ID}/close`)
        .send({ reason: 'ปิดรอบ' })
        .expect(404);
      expect(forms.closeForm).not.toHaveBeenCalled();
      expect(forms.closeRound).not.toHaveBeenCalled();
    });

    it('rejects an expired session before reaching the service', async () => {
      instructorAuthorized = false;
      await instructorRequest('post', `forms/${FORM_ID}/close`)
        .send({ reason: 'ปิดรับ' })
        .expect(403)
        .expect({ error: { code: 'FORBIDDEN' } });
      expect(forms.closeForm).not.toHaveBeenCalled();
    });
  });

  describe('request validation', () => {
    it('rejects a lifecycle command with no reason', async () => {
      await instructorRequest('post', `forms/${FORM_ID}/close`)
        .send({})
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.closeForm).not.toHaveBeenCalled();
    });

    it('rejects a reason beyond the recorded bound', async () => {
      await instructorRequest('post', `rounds/${ROUND_ID}/reopen`)
        .send({ reason: 'ก'.repeat(2_001) })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.reopenRound).not.toHaveBeenCalled();
    });

    /*
     * An unknown field is a caller that disagrees with the contract. Accepting
     * it silently would let a stale client believe it set something it did not.
     */
    it('rejects an unknown field rather than ignoring it', async () => {
      await instructorRequest('post', `forms/${FORM_ID}/close`)
        .send({ actorAccountId: OTHER_STUDENT_ACCOUNT, reason: 'ปิดรับ' })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.closeForm).not.toHaveBeenCalled();
    });

    it('rejects a malformed identifier in the path', async () => {
      await instructorRequest('get', 'forms/not-a-uuid/reopen-preview').expect(400);
      await instructorRequest('post', `rounds/${ROUND_ID}/close`)
        .send({ reason: 'ปิดรอบ' })
        .expect(201);
      await instructorRequest('post', 'rounds/12345/close').send({ reason: 'ปิดรอบ' }).expect(400);
      expect(forms.previewFormReopen).not.toHaveBeenCalled();
      expect(forms.closeRound).toHaveBeenCalledTimes(1);
    });
  });

  describe('actor identity', () => {
    /*
     * The acting Instructor comes from the session alone. A body that names a
     * different actor is rejected outright, so an audit entry can never be
     * attributed to someone the caller chose.
     */
    it('takes the acting Instructor from the session, never the body', async () => {
      await instructorRequest('post', `rounds/${ROUND_ID}/close`)
        .send({ reason: 'ปิดรอบ' })
        .expect(201);
      expect(forms.closeRound).toHaveBeenCalledWith({
        actorAccountId: INSTRUCTOR_ACCOUNT,
        reason: 'ปิดรอบ',
        roundId: ROUND_ID,
      });
    });

    it('scopes Student history to the caller, ignoring any other Student', async () => {
      await studentRequest('get', `forms/${FORM_ID}/history`).expect(200);
      expect(forms.getSubmissionHistory).toHaveBeenCalledWith({
        actorAccountId: STUDENT_ACCOUNT,
        formId: FORM_ID,
        isInstructor: false,
        studentAccountId: STUDENT_ACCOUNT,
      });
    });

    it('lets an Instructor read one named Student and marks the read as theirs', async () => {
      await instructorRequest(
        'get',
        `forms/${FORM_ID}/students/${OTHER_STUDENT_ACCOUNT}/history`,
      ).expect(200);
      expect(forms.getSubmissionHistory).toHaveBeenCalledWith({
        actorAccountId: INSTRUCTOR_ACCOUNT,
        formId: FORM_ID,
        isInstructor: true,
        studentAccountId: OTHER_STUDENT_ACCOUNT,
      });
    });
  });

  describe('domain rejections', () => {
    /*
     * A domain refusal has to arrive as its own code. If it degrades to a
     * generic failure the Instructor is told the service is down when in fact
     * someone else already closed the form.
     */
    it('reports a refused lifecycle transition with its own code', async () => {
      forms.closeForm.mockRejectedValueOnce(new CollectionFormsError('FORM_NOT_OPEN', 409));
      await instructorRequest('post', `forms/${FORM_ID}/close`)
        .send({ reason: 'ปิดรับ' })
        .expect(409)
        .expect({ error: { code: 'FORM_NOT_OPEN' } });
    });

    it('reports an already-closed round with its own code', async () => {
      forms.closeRound.mockRejectedValueOnce(new CollectionFormsError('ROUND_ALREADY_CLOSED', 409));
      await instructorRequest('post', `rounds/${ROUND_ID}/close`)
        .send({ reason: 'ปิดรอบ' })
        .expect(409)
        .expect({ error: { code: 'ROUND_ALREADY_CLOSED' } });
    });

    it('reports an unreadable history as not found', async () => {
      forms.getSubmissionHistory.mockRejectedValueOnce(
        new CollectionFormsError('OBLIGATION_NOT_FOUND', 404),
      );
      await studentRequest('get', `forms/${FORM_ID}/history`)
        .expect(404)
        .expect({ error: { code: 'OBLIGATION_NOT_FOUND' } });
    });
  });

  describe('responses', () => {
    it('returns history as dated strings and never leaks an internal account id', async () => {
      const response = await studentRequest('get', `forms/${FORM_ID}/history`).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        entries: [
          {
            answers: { company: 'CSI' },
            checkingEvents: [
              {
                decision: 'changes_required',
                instructorName: 'อาจารย์สมหญิง',
                occurredAt: '2026-09-20T03:00:00.000Z',
                reason: 'แก้ไขชื่อบริษัท',
              },
            ],
            files: {},
            id: SUBMISSION_ID,
            submittedAt: '2026-09-20T02:00:00.000Z',
            version: 1,
          },
        ],
        firstSubmittedAt: '2026-09-20T02:00:00.000Z',
        form: {
          deadlineAt: '2026-09-25T16:59:59.000Z',
          fields: [],
          id: FORM_ID,
          status: 'open',
          title: 'แบบฟอร์มสหกิจศึกษา',
        },
        isLate: false,
        status: 'changes_required',
      });
      /*
       * A checking event carries a display name only. The Instructor's account
       * id stays inside Core, and no Student ID is ever part of this shape.
       */
      expect(JSON.stringify(response.body)).not.toContain(INSTRUCTOR_ACCOUNT);
      expect(JSON.stringify(response.body)).not.toMatch(/studentId|accountId/i);
    });

    it('returns the reopen preview and the count reopening created', async () => {
      await instructorRequest('get', `forms/${FORM_ID}/reopen-preview`)
        .expect(200)
        .expect({ newlyAssignedCount: 2 });
      await instructorRequest('post', `forms/${FORM_ID}/reopen`)
        .send({ reason: 'เปิดให้ส่งเพิ่ม' })
        .expect(201)
        .expect({ form: { id: FORM_ID, status: 'open' }, newlyAssignedCount: 2 });
    });

    it('returns the outstanding work a round is closed against', async () => {
      await instructorRequest('get', `/rounds/${ROUND_ID}/pending-work`.slice(1))
        .expect(200)
        .expect({ awaitingChecking: 1, changesRequired: 1, notSubmitted: 1, total: 3 });
    });
  });

  describe('exports', () => {
    it('freezes a requested export against the session actor, not a body field', async () => {
      await instructorRequest('post', `groups/${GROUP_ID}/exports`)
        .send({ formIds: [FORM_ID], kind: 'excel' })
        .expect(201);

      expect(forms.createExport).toHaveBeenCalledWith({
        formIds: [FORM_ID],
        groupId: GROUP_ID,
        kind: 'excel',
        requestedByAccountId: INSTRUCTOR_ACCOUNT,
      });
    });

    /*
     * Who asked for an export is an internal fact. It is not needed to render
     * the history and would put one member of staff's account id on another's
     * screen, so the view omits it.
     */
    it('never returns the requesting account id', async () => {
      const response = await instructorRequest('get', `exports/${EXPORT_ID}`).expect(200);

      expect(response.body).toEqual({
        byteSize: 2_048,
        errorCode: null,
        expiresAt: '2026-09-24T03:00:00.000Z',
        id: EXPORT_ID,
        kind: 'excel',
        readyAt: '2026-09-23T03:00:00.000Z',
        requestedAt: '2026-09-23T02:59:00.000Z',
        status: 'ready',
      });
      expect(JSON.stringify(response.body)).not.toContain(INSTRUCTOR_ACCOUNT);
    });

    it('lists a group history without the requesting account id', async () => {
      const response = await instructorRequest('get', `groups/${GROUP_ID}/exports`).expect(200);

      const page = response.body as { exports: Record<string, unknown>[] };
      expect(page.exports).toHaveLength(1);
      expect(page.exports[0]).not.toHaveProperty('requestedByAccountId');
    });

    /*
     * Rechecked at download rather than trusted from the request that froze the
     * snapshot: an Instructor whose access ended must not still fetch bytes.
     */
    it('refuses a download once the session is no longer authorized', async () => {
      instructorAuthorized = false;

      await instructorRequest('get', `exports/${EXPORT_ID}/download`)
        .expect(403)
        .expect({ error: { code: 'FORBIDDEN' } });

      expect(forms.createExportDownload).not.toHaveBeenCalled();
    });

    it('does not expose export routes on the Student surface', async () => {
      await studentRequest('post', `groups/${GROUP_ID}/exports`)
        .send({ formIds: [FORM_ID], kind: 'excel' })
        .expect(404);
      await studentRequest('get', `exports/${EXPORT_ID}/download`).expect(404);
      expect(forms.createExport).not.toHaveBeenCalled();
      expect(forms.createExportDownload).not.toHaveBeenCalled();
    });

    it('rejects a kind outside the supported formats', async () => {
      await instructorRequest('post', `groups/${GROUP_ID}/exports`)
        .send({ formIds: [FORM_ID], kind: 'pdf' })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.createExport).not.toHaveBeenCalled();
    });

    it('rejects an export naming no form', async () => {
      await instructorRequest('post', `groups/${GROUP_ID}/exports`)
        .send({ formIds: [], kind: 'zip' })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.createExport).not.toHaveBeenCalled();
    });

    /* Beyond the snapshot bound the request is refused, never quietly trimmed. */
    it('rejects an export naming more forms than the snapshot allows', async () => {
      await instructorRequest('post', `groups/${GROUP_ID}/exports`)
        .send({
          formIds: Array.from(
            { length: 31 },
            (_, index) => `58000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          ),
          kind: 'zip',
        })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.createExport).not.toHaveBeenCalled();
    });

    it('rejects a form id that is not a uuid', async () => {
      await instructorRequest('post', `groups/${GROUP_ID}/exports`)
        .send({ formIds: ['not-a-uuid'], kind: 'excel' })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.createExport).not.toHaveBeenCalled();
    });

    /* A stale client must not believe it chose the actor or the expiry. */
    it('rejects an unknown field on an export request', async () => {
      await instructorRequest('post', `groups/${GROUP_ID}/exports`)
        .send({
          formIds: [FORM_ID],
          kind: 'excel',
          requestedByAccountId: OTHER_STUDENT_ACCOUNT,
        })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.createExport).not.toHaveBeenCalled();
    });

    /* An export artifact is private and short-lived; a shared cache must not keep it. */
    it('marks export responses no-store', async () => {
      await instructorRequest('get', `exports/${EXPORT_ID}`)
        .expect(200)
        .expect('Cache-Control', 'no-store');
      await instructorRequest('get', `exports/${EXPORT_ID}/download`)
        .expect(200)
        .expect('Cache-Control', 'no-store');
    });
  });

  function instructorRequest(method: 'get' | 'post' | 'put', path: string) {
    return request(app.getHttpServer())
      [method](`/v1/internal/instructor/collection/${path}`)
      .set('x-instructor-bff-secret', instructorSecret)
      .set('Authorization', 'Bearer opaque-session');
  }

  function studentRequest(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](`/v1/internal/student-collection/${path}`)
      .set('x-student-collection-bff-secret', studentSecret)
      .set('Authorization', 'Bearer opaque-session');
  }

  describe('saving a form', () => {
    const FIELD = {
      description: '',
      id: 'company',
      label: 'บริษัท',
      required: true,
      type: 'short_text',
    };
    const SAVE = {
      deadlineAt: '2026-10-10T00:00:00.000Z',
      description: 'คำอธิบาย',
      expectedVersion: 2,
      fields: [FIELD],
      title: 'แบบฟอร์มสหกิจศึกษา',
    };

    it('saves details and questions in one call, as the session Instructor', async () => {
      await instructorRequest('put', `forms/${FORM_ID}`)
        .send(SAVE)
        .expect(200)
        .expect('Cache-Control', 'no-store');

      expect(forms.saveForm).toHaveBeenCalledWith({
        ...SAVE,
        actorAccountId: INSTRUCTOR_ACCOUNT,
        formId: FORM_ID,
      });
      expect(forms.updateFormStructure).not.toHaveBeenCalled();
    });

    it('accepts an explicit null to leave the form without a deadline', async () => {
      await instructorRequest('put', `forms/${FORM_ID}`)
        .send({ ...SAVE, deadlineAt: null })
        .expect(200);
      expect(forms.saveForm).toHaveBeenCalledWith(expect.objectContaining({ deadlineAt: null }));
    });

    /* Older Instructor images still send questions alone until the follow-up removes it. */
    it('keeps the questions-only body on the legacy structure save', async () => {
      await instructorRequest('put', `forms/${FORM_ID}`)
        .send({ expectedVersion: 2, fields: [FIELD] })
        .expect(200);

      expect(forms.updateFormStructure).toHaveBeenCalledWith({
        actorAccountId: INSTRUCTOR_ACCOUNT,
        expectedVersion: 2,
        fields: [FIELD],
        formId: FORM_ID,
      });
      expect(forms.saveForm).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown field', { ...SAVE, actorAccountId: INSTRUCTOR_ACCOUNT }],
      ['a title without the other details', { expectedVersion: 2, fields: [FIELD], title: 'ชื่อ' }],
      ['details without a deadline', { ...SAVE, deadlineAt: undefined }],
      ['an empty title', { ...SAVE, title: '' }],
      ['a title over 200 characters', { ...SAVE, title: 'ก'.repeat(201) }],
      ['a description over 5,000 characters', { ...SAVE, description: 'ก'.repeat(5_001) }],
      ['a deadline that is not ISO 8601', { ...SAVE, deadlineAt: '10/10/2026' }],
      ['a version below one', { ...SAVE, expectedVersion: 0 }],
    ])('rejects %s before reaching the service', async (_case, body) => {
      await instructorRequest('put', `forms/${FORM_ID}`)
        .send(body)
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(forms.saveForm).not.toHaveBeenCalled();
      expect(forms.updateFormStructure).not.toHaveBeenCalled();
    });

    it('refuses a save from a session that is not an Instructor', async () => {
      instructorAuthorized = false;
      await instructorRequest('put', `forms/${FORM_ID}`)
        .send(SAVE)
        .expect(403)
        .expect({ error: { code: 'FORBIDDEN' } });
      expect(forms.saveForm).not.toHaveBeenCalled();
    });

    it('reports a stale version as a conflict', async () => {
      forms.saveForm.mockRejectedValueOnce(new CollectionFormsError('FORM_STALE', 409));
      await instructorRequest('put', `forms/${FORM_ID}`)
        .send(SAVE)
        .expect(409)
        .expect((response) => {
          expect((response.body as { error: { code: string } }).error.code).toBe('FORM_STALE');
        });
    });
  });

  describe('form edit history', () => {
    it('returns entries with UTC times and typed changes, marked no-store', async () => {
      const response = await instructorRequest('get', `forms/${FORM_ID}/history`)
        .expect(200)
        .expect('Cache-Control', 'no-store');

      expect(response.body).toEqual({
        entries: [
          {
            actorName: 'อาจารย์สมหญิง',
            changes: [
              { kind: 'title_changed', next: 'แบบฟอร์มใหม่', previous: 'แบบฟอร์ม' },
              { kind: 'question_added', label: 'บริษัท' },
            ],
            id: SUBMISSION_ID,
            occurredAt: '2026-09-20T03:00:00.000Z',
          },
        ],
        nextCursor: 'bmV4dC1wYWdl',
      });
      expect(forms.getFormHistory).toHaveBeenCalledWith({ cursor: undefined, formId: FORM_ID });
    });

    it('passes the cursor through to the service', async () => {
      await instructorRequest('get', `forms/${FORM_ID}/history?cursor=bmV4dC1wYWdl`).expect(200);
      expect(forms.getFormHistory).toHaveBeenCalledWith({
        cursor: 'bmV4dC1wYWdl',
        formId: FORM_ID,
      });
    });

    it('refuses the history without the Instructor BFF secret or session', async () => {
      await request(app.getHttpServer())
        .get(`/v1/internal/instructor/collection/forms/${FORM_ID}/history`)
        .set('Authorization', 'Bearer opaque-session')
        .expect(403);
      instructorAuthorized = false;
      await instructorRequest('get', `forms/${FORM_ID}/history`)
        .expect(403)
        .expect({ error: { code: 'FORBIDDEN' } });
      expect(forms.getFormHistory).not.toHaveBeenCalled();
    });

    it('does not expose the history on the Student surface', async () => {
      await studentRequest('get', `forms/${FORM_ID}/edit-history`).expect(404);
      expect(forms.getFormHistory).not.toHaveBeenCalled();
    });

    it('rejects a repeated cursor, an unknown parameter, and a malformed form id', async () => {
      await instructorRequest('get', `forms/${FORM_ID}/history?cursor=a&cursor=b`)
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      await instructorRequest('get', `forms/${FORM_ID}/history?limit=500`)
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      await instructorRequest('get', 'forms/not-a-uuid/history').expect(400);
      expect(forms.getFormHistory).not.toHaveBeenCalled();
    });

    it('reports a tampered cursor and a missing form with stable codes', async () => {
      forms.getFormHistory
        .mockRejectedValueOnce(new CollectionFormsError('FORM_HISTORY_CURSOR_INVALID', 400))
        .mockRejectedValueOnce(new CollectionFormsError('FORM_NOT_FOUND', 404));
      await instructorRequest('get', `forms/${FORM_ID}/history?cursor=dGFtcGVyZWQ`)
        .expect(400)
        .expect({ error: { code: 'FORM_HISTORY_CURSOR_INVALID' } });
      await instructorRequest('get', `forms/${FORM_ID}/history`)
        .expect(404)
        .expect({ error: { code: 'FORM_NOT_FOUND' } });
    });
  });

  describe('notifications', () => {
    it('refuses the feed without the Student collection BFF secret', async () => {
      await request(app.getHttpServer())
        .get('/v1/internal/student-collection/notifications')
        .set('authorization', 'Bearer student-token')
        .expect(403);
      expect(forms.readNotificationFeed).not.toHaveBeenCalled();
    });

    it('does not expose the feed on the Instructor surface', async () => {
      await request(app.getHttpServer())
        .get('/v1/internal/student-collection/notifications')
        .set('x-instructor-bff-secret', instructorSecret)
        .set('authorization', 'Bearer instructor-token')
        .expect(403);
      expect(forms.readNotificationFeed).not.toHaveBeenCalled();
    });

    /*
     * The account id is internal scoping. It must not travel back to a browser
     * even though the caller could only ever be that Student.
     */
    it('returns the feed without the account id that scoped it', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/internal/student-collection/notifications')
        .set('x-student-collection-bff-secret', studentSecret)
        .set('authorization', 'Bearer student-token')
        .expect(200);

      const feed = response.body as {
        notifications: Record<string, unknown>[];
        unreadCount: number;
      };
      expect(feed.unreadCount).toBe(1);
      expect(feed.notifications[0]).toEqual({
        createdAt: '2026-09-23T03:00:00.000Z',
        deadlineAt: '2026-09-25T16:59:59.000Z',
        formId: FORM_ID,
        formTitle: 'แบบฟอร์มสหกิจศึกษา',
        groupId: ROUND_ID,
        id: NOTIFICATION_ID,
        isRead: false,
        kind: 'deadline_reminder',
      });
    });

    it('takes the reading Student from the session, never the body', async () => {
      await request(app.getHttpServer())
        .post('/v1/internal/student-collection/notifications/read')
        .set('x-student-collection-bff-secret', studentSecret)
        .set('authorization', 'Bearer student-token')
        .send({ notificationIds: [NOTIFICATION_ID] })
        .expect(201);

      expect(forms.markNotificationsRead).toHaveBeenCalledWith({
        notificationIds: [NOTIFICATION_ID],
        studentAccountId: STUDENT_ACCOUNT,
      });
    });

    it('rejects an attempt to name another Student in the body', async () => {
      await request(app.getHttpServer())
        .post('/v1/internal/student-collection/notifications/read')
        .set('x-student-collection-bff-secret', studentSecret)
        .set('authorization', 'Bearer student-token')
        .send({ notificationIds: [NOTIFICATION_ID], studentAccountId: OTHER_STUDENT_ACCOUNT })
        .expect(400);
    });

    it('rejects an identifier that is not a notification id', async () => {
      await request(app.getHttpServer())
        .post('/v1/internal/student-collection/notifications/read')
        .set('x-student-collection-bff-secret', studentSecret)
        .set('authorization', 'Bearer student-token')
        .send({ notificationIds: ['not-a-uuid'] })
        .expect(400);
    });

    it('refuses a read receipt from an expired session', async () => {
      studentAuthorized = false;

      await request(app.getHttpServer())
        .post('/v1/internal/student-collection/notifications/read')
        .set('x-student-collection-bff-secret', studentSecret)
        .set('authorization', 'Bearer student-token')
        .send({ notificationIds: [NOTIFICATION_ID] })
        .expect(403);
    });
  });
});

function pendingWork() {
  return { awaitingChecking: 1, changesRequired: 1, notSubmitted: 1 };
}
