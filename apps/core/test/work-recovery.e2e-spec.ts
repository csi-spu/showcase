import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import { NodeIdentityProtector } from '../src/modules/auth/infrastructure/node-auth-crypto';
import {
  WORK_RECOVERY_REPOSITORY,
  type RemovalRequestView,
  type WorkRecoveryRepository,
} from '../src/modules/works/application/work-recovery.ports';
import { WORKS_CLOCK } from '../src/modules/works/application/works.ports';
import {
  ATTRIBUTION_REMOVAL_REPOSITORY,
  type AttributionRemovalRepository,
  type AttributionRemovalRequestView,
} from '../src/modules/works/application/attribution-removal.ports';

const ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const STUDENT_ACCOUNT_ID = id(1);
const ADMIN_ACCOUNT_ID = id(2);
const WORK_PUBLIC_ID = id(3);
const REVISION_ID = id(4);
const REVISION_PUBLIC_ID = id(5);
const REQUEST_PUBLIC_ID = id(6);
const IDEMPOTENCY_KEY = id(7);

class FakeRecoveryRepository implements WorkRecoveryRepository {
  lastCreate: Parameters<WorkRecoveryRepository['createRemovalRequest']>[0] | undefined;
  lastDecision: Parameters<WorkRecoveryRepository['decideRemovalRequest']>[0] | undefined;
  lastTransition: Parameters<WorkRecoveryRepository['transition']>[0] | undefined;

  cancelRemovalRequest() {
    return Promise.resolve({ outcome: 'resolved' as const, request: removalRequest('cancelled') });
  }

  createRemovalRequest(input: Parameters<WorkRecoveryRepository['createRemovalRequest']>[0]) {
    this.lastCreate = input;
    return Promise.resolve({ outcome: 'created' as const, request: removalRequest('pending') });
  }

  decideRemovalRequest(input: Parameters<WorkRecoveryRepository['decideRemovalRequest']>[0]) {
    this.lastDecision = input;
    return Promise.resolve({
      outcome: 'resolved' as const,
      request: removalRequest(input.decision === 'approve' ? 'approved' : 'declined'),
    });
  }

  findOwnedWorkState() {
    return Promise.resolve(work());
  }

  findOwnedPendingRemovalRequest() {
    return Promise.resolve(removalRequest('pending'));
  }

  findWorkState() {
    return Promise.resolve(work());
  }

  listPendingRemovalRequests() {
    return Promise.resolve([removalRequest('pending')]);
  }

  transition(input: Parameters<WorkRecoveryRepository['transition']>[0]) {
    this.lastTransition = input;
    return Promise.resolve({
      outcome: 'transitioned' as const,
      work: {
        ...work(),
        activityState: input.operation === 'archive' ? ('archived' as const) : ('active' as const),
        publicationState: 'unpublished' as const,
        version: 2,
      },
    });
  }
}

class FakeAttributionRemovalRepository implements AttributionRemovalRepository {
  lastApprove: Parameters<AttributionRemovalRepository['approveAndPublish']>[0] | undefined;
  lastCreate: Parameters<AttributionRemovalRepository['createPublic']>[0] | undefined;
  createPublic(input: Parameters<AttributionRemovalRepository['createPublic']>[0]) {
    this.lastCreate = input;
    return Promise.resolve({ outcome: 'created' as const });
  }
  approveAndPublish(input: Parameters<AttributionRemovalRepository['approveAndPublish']>[0]) {
    this.lastApprove = input;
    return Promise.resolve({
      outcome: 'resolved' as const,
      request: attributionRemovalRequest('accepted'),
    });
  }
  decline() {
    return Promise.resolve({
      outcome: 'resolved' as const,
      request: attributionRemovalRequest('declined'),
    });
  }
  listPending() {
    return Promise.resolve({ items: [attributionRemovalRequest('pending')], nextCursor: null });
  }
}

describe('Work recovery endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let repository: FakeRecoveryRepository;
  let attributionRepository: FakeAttributionRemovalRepository;

  beforeEach(async () => {
    repository = new FakeRecoveryRepository();
    attributionRepository = new FakeAttributionRemovalRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WORK_RECOVERY_REPOSITORY)
      .useValue(repository)
      .overrideProvider(ATTRIBUTION_REMOVAL_REPOSITORY)
      .useValue(attributionRepository)
      .overrideProvider(WORKS_CLOCK)
      .useValue({ now: () => new Date('2026-08-26T05:00:00.000Z') })
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeStudentMutation: () => Promise.resolve({ accountId: STUDENT_ACCOUNT_ID }),
      })
      .overrideProvider(AdminAuthService)
      .useValue({ authorizeAdmin: () => Promise.resolve({ accountId: ADMIN_ACCOUNT_ID }) })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(() => app.close());

  it('accepts the exact Submitter Removal Request contract without actor identity input', async () => {
    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/removal-requests`)
      .send({
        expectedWorkVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
      })
      .expect(201)
      .expect((response) => {
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toMatchObject({ outcome: 'created', request: { state: 'pending' } });
      });
    expect(repository.lastCreate).toMatchObject({
      actorAccountId: STUDENT_ACCOUNT_ID,
      workPublicId: WORK_PUBLIC_ID,
    });
    await studentRequest('post', `/v1/internal/student/works/${WORK_PUBLIC_ID}/removal-requests`)
      .send({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedWorkVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
      })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('requires Admin BFF access and validates audited recovery commands', async () => {
    await request(app.getHttpServer())
      .post(`/v1/internal/admin/works/${WORK_PUBLIC_ID}/recovery`)
      .set('Authorization', 'Bearer admin-session')
      .send(recoveryBody())
      .expect(403);
    await adminRequest('post', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/recovery`)
      .send({ ...recoveryBody(), reason: 'สั้น' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    await adminRequest('post', `/v1/internal/admin/works/${WORK_PUBLIC_ID}/recovery`)
      .send(recoveryBody())
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          outcome: 'transitioned',
          work: { activityState: 'archived', publicationState: 'unpublished' },
        });
      });
    expect(repository.lastTransition).toMatchObject({
      actorAccountId: ADMIN_ACCOUNT_ID,
      operation: 'archive',
    });
  });

  it('lists a bounded Admin queue and requires a reason only for decline', async () => {
    await adminRequest('get', '/v1/internal/admin/removal-requests?limit=20')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ items: [removalRequest('pending')] });
      });
    await adminRequest('post', `/v1/internal/admin/removal-requests/${REQUEST_PUBLIC_ID}/decision`)
      .send({
        decision: 'decline',
        expectedVersion: 1,
        expectedWorkVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(400);
    await adminRequest('post', `/v1/internal/admin/removal-requests/${REQUEST_PUBLIC_ID}/decision`)
      .send({
        decision: 'approve',
        expectedVersion: 1,
        expectedWorkVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(200);
    expect(repository.lastDecision).toMatchObject({
      actorAccountId: ADMIN_ACCOUNT_ID,
      decision: 'approve',
      decisionReason: null,
    });
  });

  it('accepts a public attribution target and atomically approves publication', async () => {
    await request(app.getHttpServer())
      .post(`/v1/public/works/${WORK_PUBLIC_ID}/attributions/${REVISION_ID}/removal-requests`)
      .send({ idempotencyKey: IDEMPOTENCY_KEY, reason: 'ขอถอนชื่อออกจากผลงานนี้' })
      .expect(202)
      .expect({ received: true });
    await adminRequest('get', '/v1/internal/admin/attribution-removal-requests?limit=20')
      .expect(200)
      .expect({ items: [attributionRemovalRequest('pending')], nextCursor: null });
    await adminRequest(
      'post',
      `/v1/internal/admin/attribution-removal-requests/${REQUEST_PUBLIC_ID}/approve-and-publish-removal`,
    )
      .send({
        expectedPublishedRevisionPublicId: REVISION_PUBLIC_ID,
        expectedPublishedRevisionVersion: 1,
        expectedRequestVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(200);
    expect(attributionRepository.lastApprove).toMatchObject({
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedRequestVersion: 1,
    });
  });

  it('accepts only an authenticated opaque Visitor source key for rate limiting', async () => {
    await request(app.getHttpServer())
      .post(`/v1/public/works/${WORK_PUBLIC_ID}/attributions/${REVISION_ID}/removal-requests`)
      .set('x-visitor-bff-secret', 'local-development-only-visitor-bff-secret')
      .set('x-visitor-source-key', 'a'.repeat(64))
      .send({ idempotencyKey: IDEMPOTENCY_KEY, reason: 'ขอถอนชื่อออกจากผลงานนี้' })
      .expect(202);

    expect(attributionRepository.lastCreate?.sourceKeyHash).toBe(
      new NodeIdentityProtector('local-development-only-identity-secret').hashSourceAddress(
        `visitor-bff:${'a'.repeat(64)}`,
      ),
    );
    expect(attributionRepository.lastCreate?.sourceKeyHash).not.toContain('203.0.113');
  });

  function studentRequest(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .set('Authorization', 'Bearer student-session');
  }

  function adminRequest(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .set('Authorization', 'Bearer admin-session');
  }
});

function work() {
  return {
    activityState: 'active' as const,
    publicationState: 'published' as const,
    publicId: WORK_PUBLIC_ID,
    publishedRevisionId: REVISION_ID,
    publishedRevisionPublicId: REVISION_PUBLIC_ID,
    version: 1,
  };
}

function removalRequest(state: RemovalRequestView['state']): RemovalRequestView {
  return {
    createdAt: '2026-08-26T05:00:00.000Z',
    decisionReason: state === 'declined' ? 'ยังไม่มีเหตุผลเพียงพอให้นำออก' : null,
    publicId: REQUEST_PUBLIC_ID,
    reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
    revisionPublicId: REVISION_PUBLIC_ID,
    state,
    title: 'ผลงานตัวอย่าง',
    version: state === 'pending' ? 1 : 2,
    workVersion: 1,
    workPublicId: WORK_PUBLIC_ID,
  };
}

function recoveryBody() {
  return {
    expectedVersion: 1,
    idempotencyKey: IDEMPOTENCY_KEY,
    operation: 'archive',
    reason: 'เก็บผลงานนี้ออกจากระบบชั่วคราว',
  };
}

function attributionRemovalRequest(
  state: AttributionRemovalRequestView['state'],
): AttributionRemovalRequestView {
  return {
    attributionName: 'Alex Example',
    attributionPublicId: REVISION_ID,
    correctionRevisionPublicId: state === 'accepted' ? id(8) : null,
    createdAt: '2026-08-26T05:00:00.000Z',
    currentPublishedRevisionPublicId: state === 'accepted' ? id(8) : REVISION_PUBLIC_ID,
    currentPublishedRevisionVersion: 2,
    publicId: REQUEST_PUBLIC_ID,
    reason: 'ขอถอนชื่อออกจากผลงานนี้',
    revisionPublicId: REVISION_PUBLIC_ID,
    state,
    version: state === 'pending' ? 1 : 2,
    workPublicId: WORK_PUBLIC_ID,
    workTitle: 'ชื่อผลงาน',
  };
}

function id(value: number): string {
  return `98000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
