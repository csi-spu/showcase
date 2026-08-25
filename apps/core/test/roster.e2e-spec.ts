import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { AUTH_CLOCK } from '../src/modules/auth/application/auth.ports';
import type {
  ClaimedRosterRow,
  CreateRosterBatchInput,
  ExistingRosterStudent,
  RosterBatch,
  RosterRepository,
} from '../src/modules/roster/application/roster.ports';
import { ROSTER_REPOSITORY } from '../src/modules/roster/application/roster.ports';
import { RosterWorker } from '../src/modules/roster/application/roster.worker';

const ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const SESSION_TOKEN = 'active-admin-session';
const ADMIN_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const BATCH_ID = '20000000-0000-4000-8000-000000000001';

class E2eRosterRepository implements RosterRepository {
  batch: RosterBatch | null = null;
  input: CreateRosterBatchInput | null = null;

  claimRows(): Promise<ClaimedRosterRow[]> {
    return Promise.resolve([]);
  }

  completeProvisioning(): Promise<'created'> {
    return Promise.resolve('created');
  }

  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch> {
    this.input = input;
    this.batch = {
      batchId: BATCH_ID,
      createdCount: 0,
      entryYear: input.entryYear,
      failedCount: 0,
      processedRowCount: 0,
      status: 'pending',
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

  markUnchanged(): Promise<void> {
    return Promise.resolve();
  }

  recordFailure(): Promise<void> {
    return Promise.resolve();
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

  it('accepts a conforming private CSV for one Entry Year and returns safe Batch status', async () => {
    const csv = Buffer.from('student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี', 'utf8');
    const created = await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('Content-Type', 'text/csv')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .set('x-entry-year', '2569')
      .send(csv)
      .expect(202);

    expect(created.body).toEqual({
      batchId: BATCH_ID,
      createdCount: 0,
      entryYear: 2569,
      failedCount: 0,
      processedRowCount: 0,
      status: 'pending',
      totalRowCount: 1,
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
      .set('x-entry-year', '2569')
      .send(csv)
      .expect(403);
    await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Content-Type', 'text/csv')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .set('x-entry-year', '2569')
      .send(csv)
      .expect(401);
    expect(repository.batch).toBeNull();
  });

  it.each([
    ['student_id,first_name_th\n69000001,สมชาย', '2569', 'INVALID_ROSTER_HEADER'],
    ['student_id,first_name_th,last_name_th\n68000001,สมชาย,ใจดี', '2569', 'ENTRY_YEAR_MISMATCH'],
    [
      'student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี',
      'not-a-year',
      'INVALID_ENTRY_YEAR',
    ],
  ])('rejects invalid upload input before persistence', async (csv, entryYear, code) => {
    await request(app.getHttpServer())
      .post('/v1/internal/admin/roster-batches')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('Content-Type', 'text/csv')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .set('x-entry-year', entryYear)
      .send(csv)
      .expect(422)
      .expect({ error: { code } });
    expect(repository.batch).toBeNull();
  });
});
