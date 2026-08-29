import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { AUTH_CLOCK } from '../src/modules/auth/application/auth.ports';
import {
  isInvalidRosterRow,
  isPreparedRosterRow,
  ROSTER_REPOSITORY,
  type ClaimedRosterRow,
  type CreateRosterBatchInput,
  type ExistingRosterStudent,
  type RosterBatch,
  type RosterConflict,
  type RosterConflictPage,
  type RosterRepository,
  type RosterRowErrorPage,
  type ResolveRosterConflictResult,
} from '../src/modules/roster/application/roster.ports';
import type { RosterErrorRow } from '../src/modules/roster/domain/roster-error-csv';
import type { RosterConflictResolution } from '../src/modules/roster/domain/roster-conflict-resolution';
import { RosterWorker } from '../src/modules/roster/application/roster.worker';

const ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const SESSION_TOKEN = 'active-admin-session';
const ADMIN_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const BATCH_ID = '20000000-0000-4000-8000-000000000001';
const CONFLICT_ID = '30000000-0000-4000-8000-000000000001';

class E2eRosterRepository implements RosterRepository {
  batch: RosterBatch | null = null;
  conflicts: RosterConflict[] = [];
  errors: RosterErrorRow[] = [];
  input: CreateRosterBatchInput | null = null;
  resolutionInput: {
    actorAccountId: string;
    conflictId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string | null;
    resolution: RosterConflictResolution;
  } | null = null;

  claimRows(): Promise<ClaimedRosterRow[]> {
    return Promise.resolve([]);
  }

  completeProvisioning(): Promise<'created'> {
    return Promise.resolve('created');
  }

  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch> {
    this.input = input;
    const validRows = input.rows.filter(isPreparedRosterRow);
    this.errors = input.rows.filter(isInvalidRosterRow).map((row) => ({ ...row }));
    this.batch = {
      batchId: BATCH_ID,
      createdCount: 0,
      entryYears: [...new Set(validRows.map((row) => row.entryYear))].sort(),
      failedCount: this.errors.length,
      processedRowCount: this.errors.length,
      status: validRows.length === 0 ? 'completed_with_errors' : 'pending',
      totalRowCount: input.rows.length,
      unchangedCount: 0,
      uploadedAt: input.now,
    };
    return Promise.resolve(this.batch);
  }

  deleteExpiredRowContent(): Promise<number> {
    return Promise.resolve(0);
  }

  findExistingStudent(): Promise<ExistingRosterStudent | null> {
    return Promise.resolve(null);
  }

  getBatch(batchId: string): Promise<RosterBatch | null> {
    return Promise.resolve(batchId === BATCH_ID ? this.batch : null);
  }

  getErrorRows(): Promise<RosterErrorRow[]> {
    return Promise.resolve(this.errors);
  }

  listConflicts(): Promise<RosterConflictPage> {
    return Promise.resolve({ conflicts: this.conflicts, nextAfterRowNumber: null });
  }

  listErrorRows(): Promise<RosterRowErrorPage> {
    return Promise.resolve({
      errors: this.errors.map((error) => ({
        ...error,
        attemptCount: 0,
        errorMessageTh: 'รหัสนักศึกษาต้องเป็นตัวเลขอารบิก 8 หลัก',
        retryState: 'not_retryable',
      })),
      nextAfterRowNumber: null,
    });
  }

  markUnchanged(): Promise<void> {
    return Promise.resolve();
  }

  recordFailure(): Promise<void> {
    return Promise.resolve();
  }

  resolveConflict(input: {
    actorAccountId: string;
    conflictId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    reason: string | null;
    resolution: RosterConflictResolution;
  }): Promise<ResolveRosterConflictResult> {
    this.resolutionInput = input;
    const conflict = this.conflicts.find((candidate) => candidate.conflictId === input.conflictId);
    if (conflict === undefined) return Promise.resolve({ outcome: 'not_found' });
    const resolved = {
      ...conflict,
      reason: input.reason,
      resolution: input.resolution,
      resolvedAt: input.now,
      status: 'resolved' as const,
      version: conflict.version + 1,
    };
    this.conflicts = [resolved];
    return Promise.resolve({ conflict: resolved, outcome: 'resolved' });
  }

  settleExistingRow(): Promise<'missing'> {
    return Promise.resolve('missing');
  }
}

describe('Admin Roster Batch API (e2e)', () => {
  let app: INestApplication<App>;
  let repository: E2eRosterRepository;
  const authorizeAdmin = jest.fn((sessionToken: string): Promise<{ accountId: string }> => {
    if (sessionToken !== SESSION_TOKEN) throw new Error('SESSION_EXPIRED');
    return Promise.resolve({ accountId: ADMIN_ACCOUNT_ID });
  });

  beforeEach(async () => {
    repository = new E2eRosterRepository();
    authorizeAdmin.mockClear();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AdminAuthService)
      .useValue({ authorizeAdmin })
      .overrideProvider(AUTH_CLOCK)
      .useValue({ now: () => new Date('2026-08-25T06:00:00.000Z') })
      .overrideProvider(ROSTER_REPOSITORY)
      .useValue(repository)
      .overrideProvider(RosterWorker)
      .useValue({ onApplicationShutdown: jest.fn(), onModuleInit: jest.fn() })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('queues one Student with server-derived Entry Year and returns no private identity data', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-students')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({ firstNameTh: 'สมชาย', lastNameTh: 'ใจดี', studentId: '69000001' })
      .expect(202);

    expect(created.body).toMatchObject({
      entryYears: [2569],
      status: 'pending',
      totalRowCount: 1,
    });
    expect(repository.input).toMatchObject({
      uploaderAccountId: ADMIN_ACCOUNT_ID,
      rows: [expect.objectContaining({ entryYear: 2569, firstNameTh: 'สมชาย' })],
    });
    expect(JSON.stringify(created.body)).not.toContain('69000001');
  });

  it.each([
    [
      'an invalid Student ID',
      { firstNameTh: 'สมชาย', lastNameTh: 'ใจดี', studentId: '6900000' },
      400,
      'INVALID_REQUEST',
    ],
    [
      'an empty normalized name',
      { firstNameTh: '   ', lastNameTh: 'ใจดี', studentId: '69000001' },
      422,
      'INVALID_FIRST_NAME',
    ],
    [
      'a client-owned Entry Year',
      { entryYear: 2500, firstNameTh: 'สมชาย', lastNameTh: 'ใจดี', studentId: '69000001' },
      400,
      'INVALID_REQUEST',
    ],
  ])('rejects %s before queuing work', async (_case, body, status, code) => {
    await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-students')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send(body)
      .expect(status)
      .expect({ error: { code } });

    expect(repository.batch).toBeNull();
  });

  it('accepts multiple cohorts in one private CSV and returns safe Batch status', async () => {
    const csv = Buffer.from(
      'student_id,first_name_th,last_name_th\n66000001,สมชาย,ใจดี\n70000001,สมหญิง,มั่นคง',
      'utf8',
    );
    const created = await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('Content-Type', 'text/csv')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send(csv)
      .expect(202);

    expect(created.body).toEqual({
      batchId: BATCH_ID,
      createdCount: 0,
      entryYears: [2566, 2570],
      failedCount: 0,
      processedRowCount: 0,
      status: 'pending',
      totalRowCount: 2,
      unchangedCount: 0,
      uploadedAt: '2026-08-25T06:00:00.000Z',
    });
    expect(repository.input?.uploaderAccountId).toBe(ADMIN_ACCOUNT_ID);
    expect(JSON.stringify(created.body)).not.toContain('69000001');

    await request(app.getHttpServer())
      .get(`/v1/internal/admin/roster-batches/${BATCH_ID}`)
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(200)
      .expect(created.body);
  });

  it('requires both the Admin BFF credential and an active Admin session', async () => {
    const csv = 'student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี';
    await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('Content-Type', 'text/csv')
      .send(csv)
      .expect(403);
    await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Content-Type', 'text/csv')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send(csv)
      .expect(401);
    expect(repository.batch).toBeNull();
  });

  it.each([['student_id,first_name_th\n69000001,สมชาย', 'INVALID_ROSTER_HEADER']])(
    'rejects structurally invalid upload input before persistence',
    async (csv, code) => {
      await request(app.getHttpServer())
        .post('/v1/internal/admin/roster-batches')
        .set('Authorization', `Bearer ${SESSION_TOKEN}`)
        .set('Content-Type', 'text/csv')
        .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
        .send(csv)
        .expect(422)
        .expect({ error: { code } });
      expect(repository.batch).toBeNull();
    },
  );

  it('keeps mixed row errors private and downloads the exact spreadsheet-safe CSV', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('Content-Type', 'text/csv')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send('student_id,first_name_th,last_name_th\n=2+3,สมชาย,ใจดี\n69000001,สมหญิง,มั่นคง')
      .expect(202);
    expect(created.body).toMatchObject({ failedCount: 1, processedRowCount: 1, totalRowCount: 2 });
    expect(JSON.stringify(created.body)).not.toContain('=2+3');

    const exported = await request(app.getHttpServer())
      .get(`/v1/internal/admin/roster-batches/${BATCH_ID}/errors.csv`)
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect('Content-Type', /text\/csv/)
      .expect('Content-Disposition', `attachment; filename="roster-batch-${BATCH_ID}-errors.csv"`);
    expect(exported.text).toContain(
      "2,'=2+3,INVALID_STUDENT_ID,รหัสนักศึกษาต้องเป็นตัวเลขอารบิก 8 หลัก",
    );
    const rowErrors = await request(app.getHttpServer())
      .get(`/v1/internal/admin/roster-batches/${BATCH_ID}/row-errors?limit=50`)
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(rowErrors.body).toEqual({
      errors: [
        {
          attemptCount: 0,
          errorCode: 'INVALID_STUDENT_ID',
          errorMessageTh: 'รหัสนักศึกษาต้องเป็นตัวเลขอารบิก 8 หลัก',
          retryState: 'not_retryable',
          rowNumber: 2,
          studentId: '=2+3',
        },
      ],
      nextAfterRowNumber: null,
    });

    await request(app.getHttpServer())
      .get(`/v1/internal/admin/roster-batches/${BATCH_ID}/errors.csv`)
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/v1/internal/admin/roster-batches/${BATCH_ID}/errors.csv`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(401);
  });

  it('lists and resolves a conflict with server-owned actor identity and strict input', async () => {
    await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('Content-Type', 'text/csv')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send('student_id,first_name_th,last_name_th\n69000001,สมหญิง,มั่นคง')
      .expect(202);
    repository.conflicts = [
      {
        batchId: BATCH_ID,
        conflictId: CONFLICT_ID,
        existingFirstNameTh: 'สมชาย',
        existingLastNameTh: 'ใจดี',
        incomingFirstNameTh: 'สมหญิง',
        incomingLastNameTh: 'มั่นคง',
        reason: null,
        resolution: null,
        resolvedAt: null,
        rowNumber: 2,
        status: 'pending',
        version: 1,
      },
    ];

    const listed = await request(app.getHttpServer())
      .get(`/v1/internal/admin/roster-batches/${BATCH_ID}/conflicts?limit=50`)
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(200);
    const listedBody = listed.body as unknown as { conflicts: unknown[] };
    expect(listedBody.conflicts).toEqual([
      expect.objectContaining({ conflictId: CONFLICT_ID, status: 'pending', version: 1 }),
    ]);
    expect(JSON.stringify(listed.body)).not.toContain('69000001');

    const resolved = await request(app.getHttpServer())
      .post(`/v1/internal/admin/roster-batches/conflicts/${CONFLICT_ID}/resolution`)
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({
        expectedVersion: 1,
        idempotencyKey: '40000000-0000-4000-8000-000000000001',
        reason: 'ตรวจสอบกับทะเบียนแล้ว',
        resolution: 'accept_incoming_name',
      })
      .expect(201);
    expect(resolved.body).toMatchObject({ status: 'resolved', version: 2 });
    expect(repository.resolutionInput).toMatchObject({ actorAccountId: ADMIN_ACCOUNT_ID });

    await request(app.getHttpServer())
      .post(`/v1/internal/admin/roster-batches/conflicts/${CONFLICT_ID}/resolution`)
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({
        actorAccountId: 'attacker-controlled',
        expectedVersion: 1,
        idempotencyKey: '40000000-0000-4000-8000-000000000002',
        resolution: 'keep_existing',
      })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });
});
