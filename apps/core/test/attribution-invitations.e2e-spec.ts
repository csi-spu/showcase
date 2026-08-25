import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AuthError } from '../src/modules/auth/application/auth.error';
import {
  AUTH_IDENTITY_PROTECTOR,
  AUTH_TOKEN_GENERATOR,
} from '../src/modules/auth/application/auth.ports';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import {
  ATTRIBUTION_INVITATIONS_CLOCK,
  ATTRIBUTION_INVITATIONS_REPOSITORY,
  ATTRIBUTION_SECRET_PROTECTOR,
  type AttributionInvitationRepository,
} from '../src/modules/works/application/attribution-invitations.ports';

const BFF_SECRET = 'local-development-only-student-bff-secret';
const SUBMITTER_ACCOUNT_ID = '66000000-0000-4000-8000-000000000001';
const RECIPIENT_ACCOUNT_ID = '66000000-0000-4000-8000-000000000002';
const WORK_PUBLIC_ID = '66000000-0000-4000-8000-000000000003';
const INVITATION_PUBLIC_ID = '66000000-0000-4000-8000-000000000004';
const IDEMPOTENCY_KEY = '66000000-0000-4000-8000-000000000005';

class E2eAttributionRepository implements AttributionInvitationRepository {
  acceptAccountInvitation = jest.fn().mockResolvedValue({ outcome: 'accepted' });
  acceptExternalInvitation = jest.fn().mockResolvedValue({ outcome: 'accepted' });
  createAccountInvitation = jest.fn().mockResolvedValue({ outcome: 'not_eligible' });
  createExternalInvitation = jest
    .fn()
    .mockResolvedValue({ invitation: invitation(), outcome: 'created' });
  exchangeExternalToken = jest
    .fn()
    .mockResolvedValue({ invitation: invitation(), outcome: 'exchanged' });
  findExternalSessionInvitation = jest.fn().mockResolvedValue(invitation());
  listReceivedInvitations = jest
    .fn()
    .mockResolvedValue({ items: [invitation('account')], nextCursor: null });
  listWorkInvitations = jest.fn().mockResolvedValue({ items: [invitation()], nextCursor: null });
  rejectAccountInvitation = jest.fn().mockResolvedValue({ outcome: 'rejected' });
  rejectExternalInvitation = jest.fn().mockResolvedValue({ outcome: 'rejected' });
  revokeInvitation = jest.fn().mockResolvedValue({ outcome: 'revoked' });
  withdrawAccountAttribution = jest.fn().mockResolvedValue({ outcome: 'withdrawn' });
}

describe('Attribution Invitation HTTP contracts (e2e)', () => {
  let app: INestApplication<App>;
  let repository: E2eAttributionRepository;

  beforeEach(async () => {
    repository = new E2eAttributionRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ATTRIBUTION_INVITATIONS_REPOSITORY)
      .useValue(repository)
      .overrideProvider(ATTRIBUTION_INVITATIONS_CLOCK)
      .useValue({ now: () => new Date('2026-08-25T10:00:00.000Z') })
      .overrideProvider(AUTH_IDENTITY_PROTECTOR)
      .useValue({
        hashSourceAddress: () => 'b'.repeat(64),
        hashStudentId: () => 'a'.repeat(64),
      })
      .overrideProvider(ATTRIBUTION_SECRET_PROTECTOR)
      .useValue({
        hashInvitationSession: () => 'c'.repeat(64),
        hashInvitationToken: () => 'd'.repeat(64),
        hashRecoveryCode: () => 'e'.repeat(64),
      })
      .overrideProvider(AUTH_TOKEN_GENERATOR)
      .useValue({ generate: (length: number) => `secret-${length}` })
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeProfileAccess: (token: string) => {
          if (token !== 'recipient-session') throw new AuthError('UNAUTHENTICATED', 401);
          return Promise.resolve({ accountId: RECIPIENT_ACCOUNT_ID, canEditProfile: false });
        },
        authorizeStudentMutation: (token: string) => {
          if (token !== 'submitter-session') throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: SUBMITTER_ACCOUNT_ID });
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('keeps exact Student-ID lookup generic and Submitter-only', async () => {
    await student(
      'post',
      `/v1/internal/student/works/${WORK_PUBLIC_ID}/contributor-invitations/account`,
      'recipient-session',
    )
      .send({ idempotencyKey: IDEMPOTENCY_KEY, studentId: '69000001' })
      .expect(403);
    const response = await student(
      'post',
      `/v1/internal/student/works/${WORK_PUBLIC_ID}/contributor-invitations/account`,
      'submitter-session',
    )
      .send({ idempotencyKey: IDEMPOTENCY_KEY, studentId: '69000001' })
      .expect(202)
      .expect({ outcome: 'received' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(/student|account|person/i);

    await student(
      'post',
      `/v1/internal/student/works/${WORK_PUBLIC_ID}/contributor-invitations/account`,
      'submitter-session',
    )
      .send({ idempotencyKey: IDEMPOTENCY_KEY, studentId: '69000001', name: 'ห้ามรับ' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('allows an Alumnus Account to accept attribution without granting authoring', async () => {
    await student('get', '/v1/internal/student/contributor-invitations', 'recipient-session')
      .expect(200)
      .expect({ items: [invitation('account')], nextCursor: null });
    await student(
      'post',
      `/v1/internal/student/contributor-invitations/${INVITATION_PUBLIC_ID}/accept`,
      'recipient-session',
    )
      .send({
        attributionName: 'ผู้ร่วมผลงาน',
        consent: true,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        studyYear: 4,
      })
      .expect(200)
      .expect({ outcome: 'accepted' });
    expect(repository.acceptAccountInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ actorAccountId: RECIPIENT_ACCOUNT_ID }),
    );
  });

  it('exchanges an external link once behind no-referrer responses and displays recovery once', async () => {
    const exchanged = await bff(
      'post',
      '/v1/internal/student/external-contributor-invitations/exchange',
    )
      .send({ token: 'high-entropy-link-secret' })
      .expect(200);
    expect(exchanged.headers['referrer-policy']).toBe('no-referrer');
    expect(exchanged.body).toMatchObject({ invitationSessionToken: 'secret-32' });
    expect(JSON.stringify(exchanged.body)).not.toContain('high-entropy-link-secret');

    await student(
      'get',
      '/v1/internal/student/external-contributor-invitations/current',
      'secret-32',
    )
      .expect(200)
      .expect(invitation());

    const accepted = await student(
      'post',
      '/v1/internal/student/external-contributor-invitations/accept',
      'secret-32',
    )
      .send({
        attributionName: 'Alex Example',
        consent: true,
        contributionRole: 'ที่ปรึกษา',
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(200);
    expect(accepted.body).toEqual({ outcome: 'accepted', recoveryCode: 'secret-18' });
    expect(accepted.headers['referrer-policy']).toBe('no-referrer');
  });

  function bff(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('x-student-bff-secret', BFF_SECRET);
  }

  function student(method: 'get' | 'post', path: string, token: string) {
    return bff(method, path).set('Authorization', `Bearer ${token}`);
  }
});

function invitation(kind: 'account' | 'external' = 'external') {
  return {
    affiliation: kind === 'external' ? 'SPU' : null,
    attributionName: null,
    contributionRole: kind === 'external' ? 'ที่ปรึกษา' : null,
    createdAt: '2026-08-25T10:00:00.000Z',
    expiresAt: '2026-09-08T10:00:00.000Z',
    kind,
    proposedAttributionName: kind === 'external' ? 'Alex Example' : null,
    publicId: INVITATION_PUBLIC_ID,
    state: 'pending',
    studyYear: null,
    version: 1,
  };
}
