import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AccountControlsService } from '../src/modules/account-controls/application/account-controls.service';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';

const ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const SESSION_TOKEN = 'active-admin-session';
const ACTOR_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '20000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000001';
const UPDATED_AT = new Date('2026-08-25T06:00:00.000Z');
const STUDENT = {
  accessEndsAcademicYear: 2576,
  accountId: STUDENT_ACCOUNT_ID,
  canUseStudentCapabilities: false,
  currentAcademicYear: 2577,
  entryYear: 2569,
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  state: 'alumnus' as const,
  version: 2,
};

describe('Admin Account Controls API (e2e)', () => {
  let app: INestApplication<App>;
  const authorizeAdmin = jest.fn((token: string): Promise<{ accountId: string }> => {
    if (token !== SESSION_TOKEN) throw new Error('SESSION_EXPIRED');
    return Promise.resolve({ accountId: ACTOR_ACCOUNT_ID });
  });
  const controls = {
    correctStudentName: jest.fn().mockResolvedValue({
      ...STUDENT,
      firstNameTh: 'สมหญิง',
      lastNameTh: 'มั่นใจ',
      version: 3,
    }),
    extendStudentAccess: jest.fn().mockResolvedValue({
      ...STUDENT,
      accessEndsAcademicYear: 2578,
      canUseStudentCapabilities: true,
      state: 'student' as const,
      version: 3,
    }),
    findStudent: jest.fn().mockResolvedValue(STUDENT),
    getAcademicYear: jest
      .fn()
      .mockResolvedValue({ currentAcademicYear: 2577, updatedAt: UPDATED_AT, version: 4 }),
    resetStudentPassword: jest.fn().mockResolvedValue({
      student: { ...STUDENT, version: 3 },
      temporaryPassword: 'one-time-random-password',
    }),
    updateAcademicYear: jest
      .fn()
      .mockResolvedValue({ currentAcademicYear: 2578, updatedAt: UPDATED_AT, version: 5 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AdminAuthService)
      .useValue({ authorizeAdmin })
      .overrideProvider(AccountControlsService)
      .useValue(controls)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('requires BFF credential and an active Admin session for every account control', async () => {
    await request(app.getHttpServer())
      .get('/v1/internal/admin/account-controls/academic-year')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/v1/internal/admin/account-controls/academic-year')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(401);
    expect(controls.getAcademicYear).not.toHaveBeenCalled();
  });

  it('reads and advances Current Academic Year with server-owned actor identity', async () => {
    await authorized(
      request(app.getHttpServer()).get('/v1/internal/admin/account-controls/academic-year'),
    )
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({ currentAcademicYear: 2577, updatedAt: UPDATED_AT.toISOString(), version: 4 });

    await authorized(
      request(app.getHttpServer()).put('/v1/internal/admin/account-controls/academic-year'),
    )
      .send({
        currentAcademicYear: 2578,
        expectedVersion: 4,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(200)
      .expect({ currentAcademicYear: 2578, updatedAt: UPDATED_AT.toISOString(), version: 5 });
    expect(controls.updateAcademicYear).toHaveBeenCalledWith({
      actorAccountId: ACTOR_ACCOUNT_ID,
      currentAcademicYear: 2578,
      expectedVersion: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
  });

  it('looks up Student ID only in a private request body and returns safe account controls', async () => {
    const response = await authorized(
      request(app.getHttpServer()).post('/v1/internal/admin/account-controls/students/lookup'),
    )
      .send({ studentId: '69000001' })
      .expect(200)
      .expect('Cache-Control', 'no-store');

    expect(response.body).toEqual(STUDENT);
    expect(controls.findStudent).toHaveBeenCalledWith('69000001');
    expect(response.request.url).not.toContain('69000001');
    expect(JSON.stringify(response.body)).not.toContain('69000001');
  });

  it('extends access and resets password with strict optimistic mutation contracts', async () => {
    await authorized(
      request(app.getHttpServer()).post(
        `/v1/internal/admin/account-controls/students/${STUDENT_ACCOUNT_ID}/access-extension`,
      ),
    )
      .send({
        accessEndsAcademicYear: 2578,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'อนุมัติตามทะเบียน',
      })
      .expect(201);
    expect(controls.extendStudentAccess).toHaveBeenCalledWith({
      accessEndsAcademicYear: 2578,
      actorAccountId: ACTOR_ACCOUNT_ID,
      expectedVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: 'อนุมัติตามทะเบียน',
      studentAccountId: STUDENT_ACCOUNT_ID,
    });

    const reset = await authorized(
      request(app.getHttpServer()).post(
        `/v1/internal/admin/account-controls/students/${STUDENT_ACCOUNT_ID}/password-reset`,
      ),
    )
      .send({ expectedVersion: 2, idempotencyKey: IDEMPOTENCY_KEY })
      .expect(201)
      .expect('Cache-Control', 'no-store');
    const resetBody = reset.body as unknown as { temporaryPassword: unknown };
    expect(resetBody.temporaryPassword).toBe('one-time-random-password');
    expect(controls.resetStudentPassword).toHaveBeenCalledWith({
      actorAccountId: ACTOR_ACCOUNT_ID,
      expectedVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      studentAccountId: STUDENT_ACCOUNT_ID,
    });
  });

  it('corrects Roster Name through an audited Admin-only mutation', async () => {
    const response = await authorized(
      request(app.getHttpServer()).put(
        `/v1/internal/admin/account-controls/students/${STUDENT_ACCOUNT_ID}/name`,
      ),
    )
      .send({
        expectedVersion: 2,
        firstNameTh: 'สมหญิง',
        idempotencyKey: IDEMPOTENCY_KEY,
        lastNameTh: 'มั่นใจ',
        reason: 'แก้ไขตามหลักฐานทะเบียน',
      })
      .expect(200)
      .expect('Cache-Control', 'no-store');

    expect(response.body).toMatchObject({
      firstNameTh: 'สมหญิง',
      lastNameTh: 'มั่นใจ',
      version: 3,
    });
    expect(controls.correctStudentName).toHaveBeenCalledWith({
      actorAccountId: ACTOR_ACCOUNT_ID,
      expectedVersion: 2,
      firstNameTh: 'สมหญิง',
      idempotencyKey: IDEMPOTENCY_KEY,
      lastNameTh: 'มั่นใจ',
      reason: 'แก้ไขตามหลักฐานทะเบียน',
      studentAccountId: STUDENT_ACCOUNT_ID,
    });
  });

  it('rejects unknown fields and invalid Student IDs before account lookup', async () => {
    for (const body of [{ studentId: '6900000' }, { extra: true, studentId: '69000001' }]) {
      await authorized(
        request(app.getHttpServer()).post('/v1/internal/admin/account-controls/students/lookup'),
      )
        .send(body)
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
    }
    expect(controls.findStudent).not.toHaveBeenCalled();
  });

  function authorized(test: request.Test): request.Test {
    return test
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET);
  }
});
