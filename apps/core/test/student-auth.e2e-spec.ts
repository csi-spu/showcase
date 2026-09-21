import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
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
import { configureApplication } from '../src/configure-application';

const STUDENT_BFF_SECRET = 'local-development-only-shared-api-key';

class E2eAuthProvider implements AuthProvider {
  currentPassword = '69000001';

  authenticate(identity: string, password: string): Promise<ProviderSession> {
    if (identity !== 'student-hash@auth.invalid' || password !== this.currentPassword) {
      return Promise.reject(new AuthProviderError('INVALID_CREDENTIALS'));
    }
    return Promise.resolve({
      accessToken: `provider-access-${password}`,
      expiresAt: new Date('2026-08-24T13:00:00.000Z'),
      providerUserId: '00000000-0000-4000-8000-000000000001',
      refreshToken: `provider-refresh-${password}`,
    });
  }

  changePassword(_accessToken: string, newPassword: string): Promise<void> {
    this.currentPassword = newPassword;
    return Promise.resolve();
  }

  refresh(): Promise<ProviderSession> {
    return this.authenticate('student-hash@auth.invalid', this.currentPassword);
  }

  revoke(): Promise<void> {
    return Promise.resolve();
  }
}

class E2eAuthRepository implements AuthRepository {
  readonly account: LoginAccount = {
    accountId: '00000000-0000-4000-8000-000000000002',
    accountStatus: 'active',
    credentialState: 'initial',
    currentAcademicYear: 2569,
    entryYear: 2569,
    hasStudentRole: true,
    providerUserId: '00000000-0000-4000-8000-000000000001',
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

  findLoginAccount(studentIdHash: string): Promise<LoginAccount | null> {
    return Promise.resolve(
      studentIdHash === this.account.studentIdHash ? { ...this.account } : null,
    );
  }

  findAdminLoginAccount(): Promise<AdminLoginAccount | null> {
    return Promise.resolve(null);
  }

  findAdminSession(): Promise<AdminAuthenticationSessionRecord | null> {
    return Promise.resolve(null);
  }

  findInstructorSession(): Promise<AdminAuthenticationSessionRecord | null> {
    return Promise.resolve(null);
  }

  findStudentCollectionSession(): Promise<AuthenticationSessionRecord | null> {
    return Promise.resolve(null);
  }

  findSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null> {
    const stored = this.sessions.get(sessionIdHash);
    if (stored === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...this.account,
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
    this.account.credentialState = 'set';
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

describe('Student authentication (e2e)', () => {
  let app: INestApplication<App>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    const clock: Clock = { now: () => new Date('2026-08-24T12:00:00.000Z') };
    const identityProtector: IdentityProtector = {
      hashAdminLogin: (value) => `admin-${value}`,
      hashSessionToken: (value) => `hashed-${value}`,
      hashSourceAddress: (value) => `source-${value}`,
      hashStudentId: (value) => (value === '69000001' ? 'student-hash' : `hash-${value}`),
      toAdminSyntheticIdentity: (value) => `admin-${value}@admin.auth.invalid`,
      toSyntheticIdentity: (value) =>
        value === '69000001' ? 'student-hash@auth.invalid' : `unknown-${value}@auth.invalid`,
    };
    let tokenNumber = 0;
    const tokenGenerator: TokenGenerator = {
      generate: () => {
        tokenNumber += 1;
        return `opaque-session-token-${tokenNumber}`;
      },
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(new E2eAuthRepository())
      .overrideProvider(AUTH_PROVIDER)
      .useValue(new E2eAuthProvider())
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
    agent = request.agent(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps unknown Account and wrong-password failures generic', async () => {
    const unknown = await agent
      .post('/v1/internal/student/auth/login')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ password: '69000001', studentId: '69999999' })
      .expect(401);
    const wrongPassword = await agent
      .post('/v1/internal/student/auth/login')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ password: 'wrong-password', studentId: '69000001' })
      .expect(401);

    expect(unknown.body).toEqual({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(wrongPassword.body).toEqual(unknown.body);
    expect(JSON.stringify(unknown.body)).not.toContain('69999999');
  });

  it('rejects missing or incorrect BFF authentication and unknown DTO fields', async () => {
    await agent
      .post('/v1/internal/student/auth/login')
      .send({ password: '69000001', studentId: '69000001' })
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });

    await agent
      .post('/v1/internal/student/auth/login')
      .set('x-student-bff-secret', `${STUDENT_BFF_SECRET}-wrong`)
      .send({ password: '69000001', studentId: '69000001' })
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });

    await agent
      .post('/v1/internal/student/auth/login')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ extra: true, password: '69000001', studentId: '69000001' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('completes login, forced password change, session rotation, and logout', async () => {
    const login = await agent
      .post('/v1/internal/student/auth/login')
      .set('x-client-address', '192.0.2.10')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ password: '69000001', studentId: '69000001' })
      .expect(200);
    const loginBody = login.body as {
      canUseStudentCapabilities: boolean;
      sessionState: string;
      sessionToken: string;
    };
    expect(loginBody).toEqual({
      canUseStudentCapabilities: false,
      sessionState: 'password_change_required',
      sessionToken: 'opaque-session-token-1',
    });
    expect(login.headers['set-cookie']).toBeUndefined();

    const passwordChange = await agent
      .post('/v1/internal/student/auth/change-password')
      .set('Authorization', `Bearer ${loginBody.sessionToken}`)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ currentPassword: '69000001', newPassword: 'correct horse battery staple' })
      .expect(200);
    const passwordChangeBody = passwordChange.body as {
      canUseStudentCapabilities: boolean;
      sessionState: string;
      sessionToken: string;
    };
    expect(passwordChangeBody).toEqual({
      canUseStudentCapabilities: true,
      sessionState: 'active',
      sessionToken: 'opaque-session-token-2',
    });

    const currentSession = await agent
      .get('/v1/internal/student/auth/session')
      .set('Authorization', `Bearer ${passwordChangeBody.sessionToken}`)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .expect(200);
    const currentSessionBody = currentSession.body as {
      canUseStudentCapabilities: boolean;
      sessionState: string;
    };
    expect(currentSessionBody).toEqual({
      canUseStudentCapabilities: true,
      sessionState: 'active',
    });

    await request(app.getHttpServer())
      .get('/v1/internal/student/auth/session')
      .set('Authorization', `Bearer ${loginBody.sessionToken}`)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .expect(401)
      .expect({ error: { code: 'SESSION_EXPIRED' } });

    await agent
      .post('/v1/internal/student/auth/logout')
      .set('Authorization', `Bearer ${passwordChangeBody.sessionToken}`)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .expect(204);
    await agent
      .get('/v1/internal/student/auth/session')
      .set('Authorization', `Bearer ${passwordChangeBody.sessionToken}`)
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .expect(401);
  });
});
