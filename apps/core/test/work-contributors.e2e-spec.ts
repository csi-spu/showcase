import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AuthError } from '../src/modules/auth/application/auth.error';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import { WorkContributorsService } from '../src/modules/works/application/work-contributors.service';

const STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const ACCOUNT_ID = '57000000-0000-4000-8000-000000000001';
const WORK_PUBLIC_ID = '57000000-0000-4000-8000-000000000002';
const CANDIDATE_REFERENCE = '57000000-0000-4000-8000-000000000003';
const CONTRIBUTOR_PUBLIC_ID = '57000000-0000-4000-8000-000000000004';
const IDEMPOTENCY_KEY = '57000000-0000-4000-8000-000000000005';

describe('direct Work Contributors (e2e)', () => {
  let app: INestApplication<App>;
  let canMutate: boolean;
  const contributors = {
    addAccount: jest.fn().mockResolvedValue(mutation('account')),
    addExternal: jest.fn().mockResolvedValue(mutation('external')),
    search: jest.fn().mockResolvedValue([
      {
        candidateReference: CANDIDATE_REFERENCE,
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        publicProfile: {
          entryYear: 2566,
          hasPhoto: true,
          publicId: '57000000-0000-4000-8000-000000000006',
        },
      },
    ]),
    remove: jest.fn().mockResolvedValue({
      contributors: [],
      outcome: 'removed',
      version: 3,
    }),
  };

  beforeEach(async () => {
    canMutate = true;
    jest.clearAllMocks();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeStudentMutation: () => {
          if (!canMutate) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: ACCOUNT_ID });
        },
      })
      .overrideProvider(WorkContributorsService)
      .useValue(contributors)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('requires an eligible Student mutation session and a bounded search query', async () => {
    await request(app.getHttpServer())
      .post(`/v1/internal/student/works/${WORK_PUBLIC_ID}/contributor-candidates/search`)
      .set('Authorization', 'Bearer opaque-session')
      .send({ query: 'สมชาย' })
      .expect(403);
    canMutate = false;
    await studentRequest('post', 'contributor-candidates/search')
      .send({ query: 'สมชาย' })
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    canMutate = true;
    await studentRequest('post', 'contributor-candidates/search')
      .send({ query: 'ก' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    expect(contributors.search).not.toHaveBeenCalled();
  });

  it('returns bounded minimal suggestions and never echoes Student ID', async () => {
    const response = await studentRequest('post', 'contributor-candidates/search')
      .send({ query: '12345678' })
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual([
      {
        candidateReference: CANDIDATE_REFERENCE,
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        publicProfile: {
          entryYear: 2566,
          hasPhoto: true,
          publicId: '57000000-0000-4000-8000-000000000006',
        },
      },
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/studentId|accountId|personId|12345678/i);
    expect(contributors.search).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAccountId: ACCOUNT_ID,
        query: '12345678',
        sourceAddress: `student-account:${ACCOUNT_ID}`,
        workPublicId: WORK_PUBLIC_ID,
      }),
    );
  });

  it('adds and removes Contributors directly through versioned idempotent commands', async () => {
    await studentRequest('post', 'contributors/account')
      .send({
        candidateReference: CANDIDATE_REFERENCE,
        contributionRole: 'พัฒนาระบบ',
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(201)
      .expect(mutation('account'));
    await studentRequest('post', 'contributors/external')
      .send({
        attributionName: 'Alex Example',
        contributionRole: 'ออกแบบ',
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(201)
      .expect(mutation('external'));
    await studentRequest('delete', `contributors/${CONTRIBUTOR_PUBLIC_ID}`)
      .send({ expectedVersion: 2, idempotencyKey: IDEMPOTENCY_KEY })
      .expect(200)
      .expect({ contributors: [], outcome: 'removed', version: 3 });
  });

  it('leaves every legacy invitation recipient route unavailable', async () => {
    await request(app.getHttpServer())
      .get('/v1/internal/student/contributor-invitations')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .set('Authorization', 'Bearer opaque-session')
      .expect(404);
    await request(app.getHttpServer())
      .post('/v1/internal/student/external-contributor-invitations/exchange')
      .send({ token: 'obsolete' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/v1/internal/student/external-contributor-recovery/exchange')
      .send({ recoveryCode: 'obsolete' })
      .expect(404);
  });

  function studentRequest(method: 'delete' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](`/v1/internal/student/works/${WORK_PUBLIC_ID}/${path}`)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .set('Authorization', 'Bearer opaque-session');
  }
});

function mutation(kind: 'account' | 'external') {
  return {
    contributors: [
      {
        attributionName: kind === 'account' ? 'สมชาย ใจดี' : 'Alex Example',
        contributionRole: kind === 'account' ? 'พัฒนาระบบ' : 'ออกแบบ',
        kind,
        publicId: CONTRIBUTOR_PUBLIC_ID,
      },
    ],
    outcome: 'added',
    version: kind === 'account' ? 2 : 3,
  };
}
