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

  findSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null> {
    const stored = this.sessions.get(sessionIdHash);
    if (stored === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...this.account,
      absoluteExpiresAt: stored.input.absoluteExpiresAt,
      csrfToken: stored.input.csrfToken,
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
      hashSessionToken: (value) => `hashed-${value}`,
      hashSourceAddress: (value) => `source-${value}`,
      hashStudentId: (value) => (value === '69000001' ? 'student-hash' : `hash-${value}`),
      toSyntheticIdentity: (value) =>
        value === '69000001' ? 'student-hash@auth.invalid' : `unknown-${value}@auth.invalid`,
    };
    let tokenNumber = 0;
    const tokenGenerator: TokenGenerator = {
      generate: () => {
        tokenNumber += 1;
        return tokenNumber % 2 === 1
          ? `opaque-session-token-${tokenNumber}`
          : `csrf-token-${tokenNumber}`;
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
      .post('/v1/student/auth/login')
      .set('Origin', 'http://localhost:3002')
      .send({ password: '69000001', studentId: '69999999' })
      .expect(401);
    const wrongPassword = await agent
      .post('/v1/student/auth/login')
      .set('Origin', 'http://localhost:3002')
      .send({ password: 'wrong-password', studentId: '69000001' })
      .expect(401);

    expect(unknown.body).toEqual({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(wrongPassword.body).toEqual(unknown.body);
    expect(JSON.stringify(unknown.body)).not.toContain('69999999');
  });

  it('rejects unknown DTO fields and a non-exact Origin', async () => {
    await agent
      .post('/v1/student/auth/login')
      .set('Origin', 'https://student.example.test.attacker.invalid')
      .send({ password: '69000001', studentId: '69000001' })
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });

    await agent
      .post('/v1/student/auth/login')
      .set('Origin', 'http://localhost:3002')
      .send({ extra: true, password: '69000001', studentId: '69000001' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('allows credentialed CORS only for an exact configured Origin', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/v1/student/auth/login')
      .set('Access-Control-Request-Method', 'POST')
      .set('Origin', 'http://localhost:3002')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3002');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .options('/v1/student/auth/login')
      .set('Access-Control-Request-Method', 'POST')
      .set('Origin', 'https://student.example.test.attacker.invalid')
      .expect(204);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('completes login, forced password change, session rotation, and logout', async () => {
    const login = await agent
      .post('/v1/student/auth/login')
      .set('Origin', 'http://localhost:3002')
      .send({ password: '69000001', studentId: '69000001' })
      .expect(200);
    const loginBody = login.body as {
      canUseStudentCapabilities: boolean;
      csrfToken: string;
      sessionState: string;
    };
    expect(loginBody).toEqual({
      canUseStudentCapabilities: false,
      csrfToken: 'csrf-token-2',
      sessionState: 'password_change_required',
    });
    const loginCookie = login.headers['set-cookie']?.[0];
    expect(loginCookie).toContain('showcase_student_session=opaque-session-token-1');
    expect(loginCookie).toContain('HttpOnly');
    expect(loginCookie).toContain('SameSite=Lax');
    expect(loginCookie).not.toContain('Domain=');

    await agent
      .post('/v1/student/auth/change-password')
      .set('Origin', 'http://localhost:3002')
      .send({ currentPassword: '69000001', newPassword: 'correct horse battery staple' })
      .expect(403);

    const changed = await agent
      .post('/v1/student/auth/change-password')
      .set('Origin', 'http://localhost:3002')
      .set('x-csrf-token', loginBody.csrfToken)
      .send({ currentPassword: '69000001', newPassword: 'correct horse battery staple' })
      .expect(200);
    const changedBody = changed.body as {
      canUseStudentCapabilities: boolean;
      csrfToken: string;
      sessionState: string;
    };
    expect(changedBody).toEqual({
      canUseStudentCapabilities: true,
      csrfToken: 'csrf-token-4',
      sessionState: 'active',
    });

    await request(app.getHttpServer())
      .get('/v1/student/auth/session')
      .set('Cookie', 'showcase_student_session=opaque-session-token-1')
      .expect(401)
      .expect({ error: { code: 'SESSION_EXPIRED' } });

    await agent
      .post('/v1/student/auth/logout')
      .set('Origin', 'http://localhost:3002')
      .set('x-csrf-token', changedBody.csrfToken)
      .expect(204);
    await agent.get('/v1/student/auth/session').expect(401);
  });
});
