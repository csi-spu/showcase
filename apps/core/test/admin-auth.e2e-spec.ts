import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import {
  AUTH_CLOCK,
  AUTH_IDENTITY_PROTECTOR,
  AUTH_PROVIDER,
  AUTH_REPOSITORY,
  AUTH_TOKEN_GENERATOR,
  AdminAuthenticationSessionRecord,
  AdminLoginAccount,
  AuthenticationSessionRecord,
  AuthProvider,
  AuthProviderError,
  AuthRepository,
  Clock,
  IdentityProtector,
  LoginAccount,
  NewAuthenticationSession,
  ProviderSession,
  TokenGenerator,
} from '../src/modules/auth/application/auth.ports';

const ACCOUNT_ID = '20000000-0000-4000-8000-000000000002';
const PROVIDER_USER_ID = '20000000-0000-4000-8000-000000000001';
const ADMIN_BFF_SECRET = 'local-development-only-shared-api-key';
const STUDENT_BFF_SECRET = 'local-development-only-shared-api-key';

function readSessionToken(body: unknown): string {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('sessionToken' in body) ||
    typeof body.sessionToken !== 'string'
  ) {
    throw new Error('Expected a session token');
  }
  return body.sessionToken;
}

class E2eProvider implements AuthProvider {
  currentPassword = 'temporary-password-value';
  isUnavailable = false;

  authenticate(identity: string, password: string): Promise<ProviderSession> {
    if (this.isUnavailable) {
      return Promise.reject(new AuthProviderError('PROVIDER_UNAVAILABLE'));
    }
    if (
      !['admin-hash@admin.auth.invalid', 'student-hash@auth.invalid'].includes(identity) ||
      password !== this.currentPassword
    ) {
      return Promise.reject(new AuthProviderError('INVALID_CREDENTIALS'));
    }
    return Promise.resolve({
      accessToken: `access-${password}`,
      expiresAt: new Date('2026-08-25T04:00:00.000Z'),
      providerUserId: PROVIDER_USER_ID,
      refreshToken: `refresh-${password}`,
    });
  }

  changePassword(_accessToken: string, newPassword: string): Promise<void> {
    this.currentPassword = newPassword;
    return Promise.resolve();
  }

  refresh(): Promise<ProviderSession> {
    return this.authenticate('admin-hash@admin.auth.invalid', this.currentPassword);
  }

  revoke(): Promise<void> {
    return Promise.resolve();
  }
}

class E2eRepository implements AuthRepository {
  readonly adminAccount: AdminLoginAccount = {
    accountId: ACCOUNT_ID,
    accountStatus: 'active',
    adminLoginHash: 'admin-hash',
    credentialState: 'initial',
    hasAdminRole: true,
    hasInstructorRole: false,
    providerUserId: PROVIDER_USER_ID,
    syntheticIdentity: 'admin-hash@admin.auth.invalid',
  };
  readonly studentAccount: LoginAccount = {
    accountId: ACCOUNT_ID,
    accountStatus: 'active',
    credentialState: 'initial',
    currentAcademicYear: 2569,
    entryYear: 2569,
    hasStudentRole: true,
    providerUserId: PROVIDER_USER_ID,
    studentAccessEndsAcademicYear: 2576,
    studentIdHash: 'student-hash',
    syntheticIdentity: 'student-hash@auth.invalid',
  };
  private readonly sessions = new Map<
    string,
    { input: NewAuthenticationSession; revokedAt: Date | null }
  >();

  consumeLoginAttempt(): Promise<{ isAllowed: boolean; retryAfterSeconds: number }> {
    return Promise.resolve({ isAllowed: true, retryAfterSeconds: 0 });
  }

  createSession(input: NewAuthenticationSession): Promise<void> {
    this.sessions.set(input.sessionIdHash, { input, revokedAt: null });
    return Promise.resolve();
  }

  findAdminLoginAccount(adminLoginHash: string): Promise<AdminLoginAccount | null> {
    return Promise.resolve(adminLoginHash === 'admin-hash' ? { ...this.adminAccount } : null);
  }

  findAdminSession(sessionIdHash: string): Promise<AdminAuthenticationSessionRecord | null> {
    const stored = this.sessions.get(sessionIdHash);
    if (stored === undefined || stored.input.audience !== 'admin') {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...this.adminAccount,
      absoluteExpiresAt: stored.input.absoluteExpiresAt,
      lastActivityAt: stored.input.now,
      providerAccessToken: stored.input.providerSession.accessToken,
      providerRefreshToken: stored.input.providerSession.refreshToken,
      providerTokenExpiresAt: stored.input.providerSession.expiresAt,
      revokedAt: stored.revokedAt,
      sessionIdHash,
    });
  }

  findInstructorSession(): Promise<null> {
    return Promise.resolve(null);
  }

  findLoginAccount(studentIdHash: string): Promise<LoginAccount | null> {
    return Promise.resolve(studentIdHash === 'student-hash' ? { ...this.studentAccount } : null);
  }

  findStudentCollectionSession(): Promise<AuthenticationSessionRecord | null> {
    return Promise.resolve(null);
  }

  findSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null> {
    const stored = this.sessions.get(sessionIdHash);
    if (stored === undefined || stored.input.audience !== 'student') {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...this.studentAccount,
      absoluteExpiresAt: stored.input.absoluteExpiresAt,
      lastActivityAt: stored.input.now,
      providerAccessToken: stored.input.providerSession.accessToken,
      providerRefreshToken: stored.input.providerSession.refreshToken,
      providerTokenExpiresAt: stored.input.providerSession.expiresAt,
      revokedAt: stored.revokedAt,
      sessionIdHash,
    });
  }

  replaceAllAccountSessions(input: NewAuthenticationSession): Promise<void> {
    for (const stored of this.sessions.values()) {
      stored.revokedAt = input.now;
    }
    this.adminAccount.credentialState = 'set';
    this.studentAccount.credentialState = 'set';
    this.sessions.set(input.sessionIdHash, { input, revokedAt: null });
    return Promise.resolve();
  }

  revokeSession(sessionIdHash: string, now: Date): Promise<void> {
    const stored = this.sessions.get(sessionIdHash);
    if (stored !== undefined) {
      stored.revokedAt = now;
    }
    return Promise.resolve();
  }

  touchSession(): Promise<void> {
    return Promise.resolve();
  }

  updateProviderSession(): Promise<void> {
    return Promise.resolve();
  }
}

describe('Admin authentication (e2e)', () => {
  let app: INestApplication<App>;
  let provider: E2eProvider;

  beforeEach(async () => {
    provider = new E2eProvider();
    const clock: Clock = { now: () => new Date('2026-08-25T03:00:00.000Z') };
    const identityProtector: IdentityProtector = {
      hashAdminLogin: (value) => (value === 'operations' ? 'admin-hash' : `admin-${value}`),
      hashSessionToken: (value) => `hashed-${value}`,
      hashSourceAddress: (value) => `source-${value}`,
      hashStudentId: (value) => (value === '69000001' ? 'student-hash' : `student-${value}`),
      toAdminSyntheticIdentity: (value) =>
        value === 'operations'
          ? 'admin-hash@admin.auth.invalid'
          : `unknown-${value}@admin.auth.invalid`,
      toSyntheticIdentity: (value) =>
        value === '69000001' ? 'student-hash@auth.invalid' : `unknown-${value}@auth.invalid`,
    };
    let tokenNumber = 0;
    const tokenGenerator: TokenGenerator = {
      generate: () => `opaque-session-${(tokenNumber += 1)}`,
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(new E2eRepository())
      .overrideProvider(AUTH_PROVIDER)
      .useValue(provider)
      .overrideProvider(AUTH_CLOCK)
      .useValue(clock)
      .overrideProvider(AUTH_IDENTITY_PROTECTOR)
      .useValue(identityProtector)
      .overrideProvider(AUTH_TOKEN_GENERATOR)
      .useValue(tokenGenerator)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps unknown Admin login and wrong-password failures generic', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/v1/internal/admin/auth/login')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({ adminLogin: 'unknown', password: 'temporary-password-value' })
      .expect(401);
    const wrong = await request(app.getHttpServer())
      .post('/v1/internal/admin/auth/login')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({ adminLogin: 'operations', password: 'wrong-password' })
      .expect(401);

    expect(unknown.body).toEqual({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(wrong.body).toEqual(unknown.body);
    expect(JSON.stringify(unknown.body)).not.toContain('unknown');
  });

  it('rejects wrong BFF credentials, malformed login names, and unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/v1/internal/admin/auth/login')
      .send({ adminLogin: 'operations', password: 'temporary-password-value' })
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });
    for (const body of [
      { adminLogin: 'UPPERCASE', password: 'temporary-password-value' },
      { adminLogin: 'operations', extra: true, password: 'temporary-password-value' },
    ]) {
      await request(app.getHttpServer())
        .post('/v1/internal/admin/auth/login')
        .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
        .send(body)
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
    }
  });

  it('completes forced password change, rotation, current session, and logout', async () => {
    const login = await adminLogin();
    expect(login.body).toEqual({
      sessionState: 'password_change_required',
      sessionToken: 'opaque-session-1',
    });
    expect(login.headers['set-cookie']).toBeUndefined();

    const changed = await request(app.getHttpServer())
      .post('/v1/internal/admin/auth/change-password')
      .set('Authorization', 'Bearer opaque-session-1')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({
        currentPassword: 'temporary-password-value',
        newPassword: 'Correct horse battery 1!',
      })
      .expect(200);
    expect(changed.body).toEqual({ sessionState: 'active', sessionToken: 'opaque-session-2' });

    await request(app.getHttpServer())
      .get('/v1/internal/admin/auth/session')
      .set('Authorization', 'Bearer opaque-session-1')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(401);
    await request(app.getHttpServer())
      .get('/v1/internal/admin/auth/session')
      .set('Authorization', 'Bearer opaque-session-2')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(200)
      .expect({ sessionState: 'active' });
    await request(app.getHttpServer())
      .post('/v1/internal/admin/auth/logout')
      .set('Authorization', 'Bearer opaque-session-2')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(204);
  });

  it('rejects wrong-audience sessions in both directions for one dual-role Person', async () => {
    const admin = await adminLogin();
    const student = await request(app.getHttpServer())
      .post('/v1/internal/student/auth/login')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ password: 'temporary-password-value', studentId: '69000001' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/v1/internal/student/auth/session')
      .set('Authorization', `Bearer ${readSessionToken(admin.body as unknown)}`)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .expect(401);
    await request(app.getHttpServer())
      .get('/v1/internal/admin/auth/session')
      .set('Authorization', `Bearer ${readSessionToken(student.body as unknown)}`)
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .expect(401);
  });

  it('maps provider outage to one safe response', async () => {
    provider.isUnavailable = true;
    await request(app.getHttpServer())
      .post('/v1/internal/admin/auth/login')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({ adminLogin: 'operations', password: 'temporary-password-value' })
      .expect(503)
      .expect({ error: { code: 'AUTH_PROVIDER_UNAVAILABLE' } });
  });

  it('permits only configured exact browser origins in the CORS boundary', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/v1/internal/admin/auth/login')
      .set('Access-Control-Request-Method', 'POST')
      .set('Origin', 'http://localhost:3001')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');

    const rejected = await request(app.getHttpServer())
      .options('/v1/internal/admin/auth/login')
      .set('Access-Control-Request-Method', 'POST')
      .set('Origin', 'https://attacker.example.test')
      .expect(204);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  function adminLogin() {
    return request(app.getHttpServer())
      .post('/v1/internal/admin/auth/login')
      .set('x-admin-bff-secret', ADMIN_BFF_SECRET)
      .send({ adminLogin: 'operations', password: 'temporary-password-value' })
      .expect(200);
  }
});
