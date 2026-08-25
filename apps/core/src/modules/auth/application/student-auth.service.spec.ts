import {
  AuthProvider,
  AuthProviderError,
  AuthRepository,
  AuthenticationSessionRecord,
  AdminAuthenticationSessionRecord,
  AdminLoginAccount,
  Clock,
  IdentityProtector,
  LoginAccount,
  NewAuthenticationSession,
  ProviderSession,
  TokenGenerator,
} from './auth.ports';
import { AuthError } from './auth.error';
import { StudentAuthService } from './student-auth.service';

class FakeAuthProvider implements AuthProvider {
  authenticateCalls = 0;
  currentPassword = '69000001';
  readonly session: ProviderSession = {
    accessToken: 'provider-access-token',
    expiresAt: new Date('2026-08-24T13:00:00.000Z'),
    providerUserId: '00000000-0000-4000-8000-000000000001',
    refreshToken: 'provider-refresh-token',
  };
  revokedAccessToken: string | null = null;

  authenticate(identity: string, password: string): Promise<ProviderSession> {
    this.authenticateCalls += 1;
    if (identity !== 'student-hash@auth.invalid' || password !== this.currentPassword) {
      return Promise.reject(new AuthProviderError('INVALID_CREDENTIALS'));
    }

    return Promise.resolve(this.session);
  }

  changePassword(accessToken: string, newPassword: string): Promise<void> {
    if (accessToken !== this.session.accessToken) {
      return Promise.reject(new AuthProviderError('PROVIDER_REJECTED'));
    }

    this.currentPassword = newPassword;
    return Promise.resolve();
  }

  refresh(): Promise<ProviderSession> {
    return Promise.resolve(this.session);
  }

  revoke(accessToken: string): Promise<void> {
    this.revokedAccessToken = accessToken;
    return Promise.resolve();
  }
}

class FakeAuthRepository implements AuthRepository {
  account: LoginAccount | null = {
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
  createdSession: NewAuthenticationSession | null = null;
  rateLimitResult = { isAllowed: true, retryAfterSeconds: 0 };
  replacedSession: NewAuthenticationSession | null = null;
  revokedSessionIdHash: string | null = null;
  session: AuthenticationSessionRecord | null = null;
  updatedProviderSession: ProviderSession | null = null;

  consumeLoginAttempt(): Promise<{ isAllowed: boolean; retryAfterSeconds: number }> {
    return Promise.resolve(this.rateLimitResult);
  }

  createSession(input: NewAuthenticationSession): Promise<void> {
    this.createdSession = input;
    return Promise.resolve();
  }

  findLoginAccount(studentIdHash: string): Promise<LoginAccount | null> {
    return Promise.resolve(studentIdHash === 'student-hash' ? this.account : null);
  }

  findAdminLoginAccount(): Promise<AdminLoginAccount | null> {
    return Promise.resolve(null);
  }

  findAdminSession(): Promise<AdminAuthenticationSessionRecord | null> {
    return Promise.resolve(null);
  }

  findSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null> {
    return Promise.resolve(sessionIdHash === this.session?.sessionIdHash ? this.session : null);
  }

  replaceAllAccountSessions(input: NewAuthenticationSession): Promise<void> {
    this.replacedSession = input;
    return Promise.resolve();
  }

  revokeSession(sessionIdHash: string): Promise<void> {
    this.revokedSessionIdHash = sessionIdHash;
    return Promise.resolve();
  }

  touchSession(): Promise<void> {
    return Promise.resolve();
  }

  updateProviderSession(_sessionIdHash: string, providerSession: ProviderSession): Promise<void> {
    this.updatedProviderSession = providerSession;
    return Promise.resolve();
  }
}

const clock: Clock = { now: () => new Date('2026-08-24T12:00:00.000Z') };
const identityProtector: IdentityProtector = {
  hashAdminLogin: (value) => `admin-${value}`,
  hashSessionToken: (value) => `hashed-${value}`,
  hashSourceAddress: (value) => `source-${value}`,
  hashStudentId: (value) => (value === '69000001' ? 'student-hash' : `hash-${value}`),
  toAdminSyntheticIdentity: (value) => `admin-${value}@admin.auth.invalid`,
  toSyntheticIdentity: () => 'student-hash@auth.invalid',
};

function createService(repository = new FakeAuthRepository(), provider = new FakeAuthProvider()) {
  const tokenGenerator: TokenGenerator = {
    generate: () => 'opaque-session-token',
  };

  return {
    provider,
    repository,
    service: new StudentAuthService(repository, provider, clock, identityProtector, tokenGenerator),
  };
}

function createStoredSession(
  account: LoginAccount = new FakeAuthRepository().account as LoginAccount,
): AuthenticationSessionRecord {
  return {
    ...account,
    absoluteExpiresAt: new Date('2026-08-31T12:00:00.000Z'),
    lastActivityAt: new Date('2026-08-24T11:00:00.000Z'),
    providerAccessToken: 'provider-access-token',
    providerRefreshToken: 'provider-refresh-token',
    providerTokenExpiresAt: new Date('2026-08-24T13:00:00.000Z'),
    revokedAt: null,
    sessionIdHash: 'hashed-current-session-token',
  };
}

describe('StudentAuthService login', () => {
  it('creates only a forced-change Authentication Session for initial credentials', async () => {
    const { repository, service } = createService();

    await expect(
      service.login({ password: '69000001', sourceAddress: '192.0.2.1', studentId: '69000001' }),
    ).resolves.toEqual({
      canUseStudentCapabilities: false,
      sessionState: 'password_change_required',
      sessionToken: 'opaque-session-token',
    });
    expect(repository.createdSession).toEqual({
      absoluteExpiresAt: new Date('2026-08-31T12:00:00.000Z'),
      accountId: '00000000-0000-4000-8000-000000000002',
      audience: 'student',
      eventType: 'student_login',
      now: new Date('2026-08-24T12:00:00.000Z'),
      providerSession: new FakeAuthProvider().session,
      sessionIdHash: 'hashed-opaque-session-token',
      sourceKeyHash: 'source-192.0.2.1',
    });
  });

  it('makes an unknown Account and wrong password indistinguishable', async () => {
    const unknownRepository = new FakeAuthRepository();
    unknownRepository.account = null;
    const unknownAccount = createService(unknownRepository).service.login({
      password: '69000001',
      sourceAddress: '192.0.2.1',
      studentId: '69000001',
    });
    const wrongPassword = createService().service.login({
      password: 'wrong-password',
      sourceAddress: '192.0.2.1',
      studentId: '69000001',
    });

    await expect(unknownAccount).rejects.toEqual(new AuthError('INVALID_CREDENTIALS', 401));
    await expect(wrongPassword).rejects.toEqual(new AuthError('INVALID_CREDENTIALS', 401));
  });

  it('rejects a rate-limited login before establishing a session', async () => {
    const repository = new FakeAuthRepository();
    repository.rateLimitResult = { isAllowed: false, retryAfterSeconds: 300 };
    const { provider, service } = createService(repository);

    await expect(
      service.login({ password: '69000001', sourceAddress: '192.0.2.1', studentId: '69000001' }),
    ).rejects.toEqual(new AuthError('RATE_LIMITED', 429, 300));
    expect(repository.createdSession).toBeNull();
    expect(provider.authenticateCalls).toBe(0);
  });
});

describe('StudentAuthService password change', () => {
  it('rotates the session, revokes older Account sessions, and enables Student capabilities', async () => {
    const repository = new FakeAuthRepository();
    repository.session = createStoredSession();
    const { service } = createService(repository);

    await expect(
      service.changePassword({
        currentPassword: '69000001',
        newPassword: 'correct horse battery staple',
        sessionToken: 'current-session-token',
      }),
    ).resolves.toEqual({
      canUseStudentCapabilities: true,
      sessionState: 'active',
      sessionToken: 'opaque-session-token',
    });
    expect(repository.replacedSession).toMatchObject({
      accountId: repository.account?.accountId,
      audience: 'student',
      sessionIdHash: 'hashed-opaque-session-token',
    });
  });

  it('rejects a chosen password that violates policy without rotating the session', async () => {
    const repository = new FakeAuthRepository();
    repository.session = createStoredSession();
    const { service } = createService(repository);

    await expect(
      service.changePassword({
        currentPassword: '69000001',
        newPassword: '69000001',
        sessionToken: 'current-session-token',
      }),
    ).rejects.toEqual(new AuthError('INVALID_PASSWORD', 422));
    expect(repository.replacedSession).toBeNull();
  });
});

describe('StudentAuthService session lifecycle', () => {
  it('reports the current forced-change state from current server-owned Account data', async () => {
    const repository = new FakeAuthRepository();
    repository.session = createStoredSession();
    const { service } = createService(repository);

    await expect(service.getSession('current-session-token')).resolves.toEqual({
      canUseStudentCapabilities: false,
      sessionState: 'password_change_required',
    });
  });

  it('restricts the first authenticated session after an Admin reset to password change', async () => {
    const repository = new FakeAuthRepository();
    repository.session = { ...createStoredSession(), credentialState: 'reset_required' };
    const { service } = createService(repository);

    await expect(service.getSession('current-session-token')).resolves.toEqual({
      canUseStudentCapabilities: false,
      sessionState: 'password_change_required',
    });
    await expect(service.authorizeStudentMutation('current-session-token')).rejects.toEqual(
      new AuthError('FORBIDDEN', 403),
    );
  });

  it('expires a Student session after 24 hours of inactivity', async () => {
    const repository = new FakeAuthRepository();
    repository.session = {
      ...createStoredSession(),
      lastActivityAt: new Date('2026-08-23T12:00:00.000Z'),
    };
    const { service } = createService(repository);

    await expect(service.getSession('current-session-token')).rejects.toEqual(
      new AuthError('SESSION_EXPIRED', 401),
    );
    expect(repository.revokedSessionIdHash).toBe('hashed-current-session-token');
  });

  it('expires a Student session at its seven-day absolute limit', async () => {
    const repository = new FakeAuthRepository();
    repository.session = {
      ...createStoredSession(),
      absoluteExpiresAt: new Date('2026-08-24T12:00:00.000Z'),
      lastActivityAt: new Date('2026-08-24T11:59:00.000Z'),
    };
    const { service } = createService(repository);

    await expect(service.getSession('current-session-token')).rejects.toEqual(
      new AuthError('SESSION_EXPIRED', 401),
    );
  });

  it('refreshes expiring provider credentials behind Core', async () => {
    const repository = new FakeAuthRepository();
    repository.session = {
      ...createStoredSession(),
      credentialState: 'set',
      providerTokenExpiresAt: new Date('2026-08-24T12:00:30.000Z'),
    };
    const { provider, service } = createService(repository);

    await expect(service.getSession('current-session-token')).resolves.toMatchObject({
      sessionState: 'active',
    });
    expect(repository.updatedProviderSession).toEqual(provider.session);
  });

  it('revokes the current Core and provider session on logout', async () => {
    const repository = new FakeAuthRepository();
    repository.session = createStoredSession();
    const { provider, service } = createService(repository);

    await expect(
      service.logout({
        sessionToken: 'current-session-token',
      }),
    ).resolves.toBeUndefined();
    expect(repository.revokedSessionIdHash).toBe('hashed-current-session-token');
    expect(provider.revokedAccessToken).toBe('provider-access-token');
  });

  it('denies every Student mutation while password change is required', async () => {
    const repository = new FakeAuthRepository();
    repository.session = createStoredSession();
    const { service } = createService(repository);

    await expect(service.authorizeStudentMutation('current-session-token')).rejects.toEqual(
      new AuthError('FORBIDDEN', 403),
    );
  });

  it('resolves the current Account as actor only after current access checks pass', async () => {
    const repository = new FakeAuthRepository();
    repository.session = { ...createStoredSession(), credentialState: 'set' };
    const { service } = createService(repository);

    await expect(service.authorizeStudentMutation('current-session-token')).resolves.toEqual({
      accountId: repository.account?.accountId,
    });
  });

  it.each([
    ['missing Current Academic Year', null],
    ['expired Student Access Period', 2577],
  ] as const)('denies every Student mutation with %s', async (_case, currentAcademicYear) => {
    const repository = new FakeAuthRepository();
    repository.session = {
      ...createStoredSession(),
      credentialState: 'set',
      currentAcademicYear,
    };
    const { service } = createService(repository);

    await expect(service.authorizeStudentMutation('current-session-token')).rejects.toEqual(
      new AuthError('FORBIDDEN', 403),
    );
  });
});
