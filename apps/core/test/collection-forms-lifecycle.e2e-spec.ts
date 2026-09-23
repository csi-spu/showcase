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

  const forms = {
    closeForm: jest.fn().mockResolvedValue({ id: FORM_ID, status: 'closed' }),
    closeRound: jest.fn().mockResolvedValue({ pendingWork: pendingWork() }),
    getRoundPendingWork: jest.fn().mockResolvedValue({ ...pendingWork(), total: 3 }),
    getSubmissionHistory: jest.fn().mockResolvedValue(history),
    previewFormReopen: jest.fn().mockResolvedValue({ newlyAssignedCount: 2 }),
    reopenForm: jest
      .fn()
      .mockResolvedValue({ form: { id: FORM_ID, status: 'open' }, newlyAssignedCount: 2 }),
    reopenRound: jest.fn().mockResolvedValue({ pendingWork: pendingWork() }),
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

  function instructorRequest(method: 'get' | 'post', path: string) {
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
});

function pendingWork() {
  return { awaitingChecking: 1, changesRequired: 1, notSubmitted: 1 };
}
