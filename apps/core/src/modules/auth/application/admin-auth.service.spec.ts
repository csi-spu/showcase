import { AuthError } from './auth.error';
import {
  AdminAuthenticationSessionRecord,
  AdminLoginAccount,
  AuthProvider,
  AuthProviderError,
  AuthRepository,
  Clock,
  IdentityProtector,
  NewAuthenticationSession,
  ProviderSession,
  TokenGenerator,
} from './auth.ports';
import { AdminAuthService } from './admin-auth.service';

const NOW = new Date('2026-08-25T03:00:00.000Z');
const PROVIDER_USER_ID = '00000000-0000-4000-8000-000000000011';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000012';

class FakeProvider implements AuthProvider {
  authenticateError: Error | null = null;
  authenticateErrors: Array<Error | null> = [];
  changePasswordError: Error | null = null;
  currentPassword = 'temporary-password-value';
  isRevokeRejected = false;
  revokeCalls = 0;
  refreshError: Error | null = null;
  refreshSession: ProviderSession | null = null;
  session: ProviderSession = {
    accessToken: 'admin-provider-access',
    expiresAt: new Date('2026-08-25T04:00:00.000Z'),
    providerUserId: PROVIDER_USER_ID,
    refreshToken: 'admin-provider-refresh',
  };

  authenticate(identity: string, password: string): Promise<ProviderSession> {
    const queuedError = this.authenticateErrors.shift();
    const error = queuedError === undefined ? this.authenticateError : queuedError;
    if (error !== null) {
      return Promise.reject(error);
    }
    return identity === 'admin-hash@admin.auth.invalid' && password === this.currentPassword
      ? Promise.resolve(this.session)
      : Promise.reject(new AuthProviderError('INVALID_CREDENTIALS'));
  }

  changePassword(_accessToken: string, newPassword: string): Promise<void> {
    if (this.changePasswordError !== null) {
      return Promise.reject(this.changePasswordError);
    }
    this.currentPassword = newPassword;
    return Promise.resolve();
  }

  refresh(): Promise<ProviderSession> {
    return this.refreshError === null
      ? Promise.resolve(this.refreshSession ?? this.session)
      : Promise.reject(this.refreshError);
  }

  revoke(): Promise<void> {
    this.revokeCalls += 1;
    return this.isRevokeRejected
      ? Promise.reject(new AuthProviderError('PROVIDER_UNAVAILABLE'))
      : Promise.resolve();
  }
}

class FakeRepository implements AuthRepository {
  adminAccount: AdminLoginAccount | null = {
    accountId: ACCOUNT_ID,
    accountStatus: 'active',
    adminLoginHash: 'admin-hash',
    credentialState: 'initial',
    hasAdminRole: true,
    hasInstructorRole: false,
    providerUserId: PROVIDER_USER_ID,
    syntheticIdentity: 'admin-hash@admin.auth.invalid',
  };
  adminSession: AdminAuthenticationSessionRecord | null = null;
  createdSession: NewAuthenticationSession | null = null;
  rateLimitResult = { isAllowed: true, retryAfterSeconds: 0 };
  replacedSession: NewAuthenticationSession | null = null;
  revokedReason: string | null = null;
  touchedSession = false;
  updatedProviderSession: ProviderSession | null = null;

  consumeLoginAttempt(): Promise<{ isAllowed: boolean; retryAfterSeconds: number }> {
    return Promise.resolve(this.rateLimitResult);
  }

  createSession(input: NewAuthenticationSession): Promise<void> {
    this.createdSession = input;
    return Promise.resolve();
  }

  findAdminLoginAccount(adminLoginHash: string): Promise<AdminLoginAccount | null> {
    return Promise.resolve(adminLoginHash === 'admin-hash' ? this.adminAccount : null);
  }

  findAdminSession(sessionIdHash: string): Promise<AdminAuthenticationSessionRecord | null> {
    return Promise.resolve(
      sessionIdHash === this.adminSession?.sessionIdHash ? this.adminSession : null,
    );
  }

  findInstructorSession(): Promise<null> {
    return Promise.resolve(null);
  }

  findLoginAccount(): Promise<null> {
    return Promise.resolve(null);
  }

  findSession(): Promise<null> {
    return Promise.resolve(null);
  }

  findStudentCollectionSession(): Promise<null> {
    return Promise.resolve(null);
  }

  replaceAllAccountSessions(input: NewAuthenticationSession): Promise<void> {
    this.replacedSession = input;
    return Promise.resolve();
  }

  revokeSession(_sessionIdHash: string, _now: Date, reason: string): Promise<void> {
    this.revokedReason = reason;
    return Promise.resolve();
  }

  touchSession(): Promise<void> {
    this.touchedSession = true;
    return Promise.resolve();
  }

  updateProviderSession(_sessionIdHash: string, providerSession: ProviderSession): Promise<void> {
    this.updatedProviderSession = providerSession;
    return Promise.resolve();
  }
}

const identityProtector: IdentityProtector = {
  hashAdminLogin: (value) => (value === 'operations' ? 'admin-hash' : `hash-${value}`),
  hashSessionToken: (value) => `hashed-${value}`,
  hashSourceAddress: (value) => `source-${value}`,
  hashStudentId: (value) => `student-${value}`,
  toAdminSyntheticIdentity: () => 'admin-hash@admin.auth.invalid',
  toSyntheticIdentity: () => 'student-hash@auth.invalid',
};

function storedSession(
  account: AdminLoginAccount = new FakeRepository().adminAccount as AdminLoginAccount,
): AdminAuthenticationSessionRecord {
  return {
    ...account,
    absoluteExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
    lastActivityAt: new Date('2026-08-25T02:31:00.000Z'),
    providerAccessToken: 'admin-provider-access',
    providerRefreshToken: 'admin-provider-refresh',
    providerTokenExpiresAt: new Date('2026-08-25T04:00:00.000Z'),
    revokedAt: null,
    sessionIdHash: 'hashed-current-token',
  };
}

function setup(repository = new FakeRepository(), provider = new FakeProvider()) {
  const clock: Clock = { now: () => NOW };
  const tokenGenerator: TokenGenerator = { generate: () => 'new-admin-session-token' };
  return {
    provider,
    repository,
    service: new AdminAuthService(repository, provider, clock, identityProtector, tokenGenerator),
  };
}

describe('AdminAuthService login', () => {
  it('creates a restricted Admin-audience session with an eight-hour absolute limit', async () => {
    const { repository, service } = setup();

    await expect(
      service.login({
        adminLogin: 'operations',
        password: 'temporary-password-value',
        sourceAddress: '192.0.2.20',
      }),
    ).resolves.toEqual({
      sessionState: 'password_change_required',
      sessionToken: 'new-admin-session-token',
    });
    expect(repository.createdSession).toEqual({
      absoluteExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
      accountId: ACCOUNT_ID,
      audience: 'admin',
      eventType: 'admin_login',
      now: NOW,
      providerSession: new FakeProvider().session,
      sessionIdHash: 'hashed-new-admin-session-token',
      sourceKeyHash: 'source-192.0.2.20',
    });
  });

  it('returns an active session for an Admin with a chosen password', async () => {
    const repository = new FakeRepository();
    repository.adminAccount = { ...repository.adminAccount!, credentialState: 'set' };

    await expect(
      setup(repository).service.login({
        adminLogin: 'operations',
        password: 'temporary-password-value',
        sourceAddress: '192.0.2.20',
      }),
    ).resolves.toMatchObject({ sessionState: 'active' });
  });

  it('keeps unknown login, wrong password, missing role, and provider mismatch generic', async () => {
    const cases: Array<() => Promise<unknown>> = [];
    const unknown = new FakeRepository();
    unknown.adminAccount = null;
    cases.push(() =>
      setup(unknown).service.login({
        adminLogin: 'operations',
        password: 'temporary-password-value',
        sourceAddress: 'unknown',
      }),
    );
    cases.push(() =>
      setup().service.login({
        adminLogin: 'operations',
        password: 'wrong-password',
        sourceAddress: 'unknown',
      }),
    );
    for (const accountChange of [
      { accountStatus: 'suspended' as const },
      { hasAdminRole: false },
      { providerUserId: '00000000-0000-4000-8000-000000000099' },
    ]) {
      const repository = new FakeRepository();
      repository.adminAccount = { ...repository.adminAccount!, ...accountChange };
      cases.push(() =>
        setup(repository).service.login({
          adminLogin: 'operations',
          password: 'temporary-password-value',
          sourceAddress: 'unknown',
        }),
      );
    }

    for (const attempt of cases) {
      await expect(attempt()).rejects.toEqual(new AuthError('INVALID_CREDENTIALS', 401));
    }
  });

  it('enforces rate limits before calling the provider', async () => {
    const repository = new FakeRepository();
    repository.rateLimitResult = { isAllowed: false, retryAfterSeconds: 120 };

    await expect(
      setup(repository).service.login({
        adminLogin: 'operations',
        password: 'temporary-password-value',
        sourceAddress: '192.0.2.20',
      }),
    ).rejects.toEqual(new AuthError('RATE_LIMITED', 429, 120));
    expect(repository.createdSession).toBeNull();
  });

  it('maps provider availability failures without provider detail', async () => {
    const provider = new FakeProvider();
    provider.authenticateError = new AuthProviderError('PROVIDER_UNAVAILABLE');

    await expect(
      setup(new FakeRepository(), provider).service.login({
        adminLogin: 'operations',
        password: 'temporary-password-value',
        sourceAddress: 'unknown',
      }),
    ).rejects.toEqual(new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503));
  });
});

describe('AdminAuthService password and authorization', () => {
  it('rotates every Account session after password change and enables Admin authorization', async () => {
    const repository = new FakeRepository();
    repository.adminSession = storedSession();
    const { service } = setup(repository);

    await expect(
      service.changePassword({
        currentPassword: 'temporary-password-value',
        newPassword: 'correct horse battery staple',
        sessionToken: 'current-token',
      }),
    ).resolves.toEqual({ sessionState: 'active', sessionToken: 'new-admin-session-token' });
    expect(repository.replacedSession).toMatchObject({
      accountId: ACCOUNT_ID,
      audience: 'admin',
      eventType: 'admin_password_changed',
    });

    repository.adminSession = { ...storedSession(), credentialState: 'set' };
    await expect(service.authorizeAdmin('current-token')).resolves.toEqual({
      accountId: ACCOUNT_ID,
    });
  });

  it('rejects unchanged, short, and long passwords before provider mutation', async () => {
    for (const newPassword of ['temporary-password-value', 'short', 'x'.repeat(129)]) {
      const repository = new FakeRepository();
      repository.adminSession = storedSession();
      await expect(
        setup(repository).service.changePassword({
          currentPassword: 'temporary-password-value',
          newPassword,
          sessionToken: 'current-token',
        }),
      ).rejects.toEqual(new AuthError('INVALID_PASSWORD', 422));
      expect(repository.replacedSession).toBeNull();
    }
  });

  it('maps each password-provider failure without persisting a replacement session', async () => {
    const cases: FakeProvider[] = [];

    const invalidCurrentPassword = new FakeProvider();
    invalidCurrentPassword.authenticateError = new AuthProviderError('INVALID_CREDENTIALS');
    cases.push(invalidCurrentPassword);

    const providerUnavailable = new FakeProvider();
    providerUnavailable.authenticateError = new AuthProviderError('PROVIDER_UNAVAILABLE');
    cases.push(providerUnavailable);

    const providerRejected = new FakeProvider();
    providerRejected.authenticateError = new AuthProviderError('PROVIDER_REJECTED');
    cases.push(providerRejected);

    const passwordMutationFailure = new FakeProvider();
    passwordMutationFailure.changePasswordError = new AuthProviderError('PROVIDER_REJECTED');
    cases.push(passwordMutationFailure);

    const replacementLoginFailure = new FakeProvider();
    replacementLoginFailure.authenticateErrors = [
      null,
      new AuthProviderError('PROVIDER_UNAVAILABLE'),
    ];
    cases.push(replacementLoginFailure);

    const unexpectedProviderFailure = new FakeProvider();
    unexpectedProviderFailure.authenticateError = new Error('provider detail');
    cases.push(unexpectedProviderFailure);

    for (const provider of cases) {
      const repository = new FakeRepository();
      repository.adminSession = storedSession();
      await expect(
        setup(repository, provider).service.changePassword({
          currentPassword: 'temporary-password-value',
          newPassword: 'correct horse battery staple',
          sessionToken: 'current-token',
        }),
      ).rejects.toBeInstanceOf(AuthError);
      expect(repository.replacedSession).toBeNull();
    }
  });

  it('rejects and cleans up a current-password session for the wrong provider identity', async () => {
    const repository = new FakeRepository();
    repository.adminSession = storedSession();
    const provider = new FakeProvider();
    provider.session = {
      ...provider.session,
      providerUserId: '00000000-0000-4000-8000-000000000099',
    };

    await expect(
      setup(repository, provider).service.changePassword({
        currentPassword: 'temporary-password-value',
        newPassword: 'correct horse battery staple',
        sessionToken: 'current-token',
      }),
    ).rejects.toEqual(new AuthError('INVALID_CREDENTIALS', 401));
    expect(provider.revokeCalls).toBe(1);
    expect(repository.replacedSession).toBeNull();
  });

  it('denies Admin authorization while password change is required or role is removed', async () => {
    const forcedRepository = new FakeRepository();
    forcedRepository.adminSession = storedSession();
    await expect(setup(forcedRepository).service.authorizeAdmin('current-token')).rejects.toEqual(
      new AuthError('FORBIDDEN', 403),
    );

    const roleRepository = new FakeRepository();
    roleRepository.adminSession = storedSession({
      ...roleRepository.adminAccount!,
      hasAdminRole: false,
    });
    await expect(setup(roleRepository).service.getSession('current-token')).rejects.toEqual(
      new AuthError('UNAUTHENTICATED', 401),
    );
    expect(roleRepository.revokedReason).toBe('authorization_changed');
  });

  it.each([
    ['suspended Account', { accountStatus: 'suspended' as const }],
    ['missing provider identity', { providerUserId: '' }],
  ])('revokes authorization when the %s invalidates the session', async (_case, accountChange) => {
    const repository = new FakeRepository();
    repository.adminSession = storedSession({
      ...repository.adminAccount!,
      ...accountChange,
    });

    await expect(setup(repository).service.getSession('current-token')).rejects.toEqual(
      new AuthError('UNAUTHENTICATED', 401),
    );
    expect(repository.revokedReason).toBe('authorization_changed');
  });
});

describe('AdminAuthService session lifecycle', () => {
  it('reports password change required for a valid initial session', async () => {
    const repository = new FakeRepository();
    repository.adminSession = storedSession();

    await expect(setup(repository).service.getSession('current-token')).resolves.toEqual({
      sessionState: 'password_change_required',
    });
  });

  it.each([
    ['30-minute inactivity', { lastActivityAt: new Date('2026-08-25T02:30:00.000Z') }],
    ['eight-hour absolute limit', { absoluteExpiresAt: NOW }],
  ])('expires at the %s boundary', async (_case, change) => {
    const repository = new FakeRepository();
    repository.adminSession = { ...storedSession(), ...change };

    await expect(setup(repository).service.getSession('current-token')).rejects.toEqual(
      new AuthError('SESSION_EXPIRED', 401),
    );
    expect(repository.revokedReason).toBe('expired');
  });

  it('rejects a Student-audience token because the Admin repository cannot resolve it', async () => {
    await expect(setup().service.getSession('student-session-token')).rejects.toEqual(
      new AuthError('SESSION_EXPIRED', 401),
    );
  });

  it('rejects an already revoked Admin session without changing its revocation reason', async () => {
    const repository = new FakeRepository();
    repository.adminSession = {
      ...storedSession(),
      revokedAt: new Date('2026-08-25T02:45:00.000Z'),
    };

    await expect(setup(repository).service.getSession('current-token')).rejects.toEqual(
      new AuthError('SESSION_EXPIRED', 401),
    );
    expect(repository.revokedReason).toBeNull();
  });

  it('refreshes expiring provider credentials and maps refresh failures safely', async () => {
    const repository = new FakeRepository();
    repository.adminSession = {
      ...storedSession(),
      credentialState: 'set',
      providerTokenExpiresAt: new Date('2026-08-25T03:00:30.000Z'),
    };
    const successful = setup(repository);
    await expect(successful.service.getSession('current-token')).resolves.toEqual({
      sessionState: 'active',
    });
    expect(repository.updatedProviderSession).toEqual(successful.provider.session);

    const unavailableProvider = new FakeProvider();
    unavailableProvider.refreshError = new AuthProviderError('PROVIDER_UNAVAILABLE');
    await expect(
      setup(repository, unavailableProvider).service.getSession('current-token'),
    ).rejects.toEqual(new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503));
  });

  it('revokes a session when provider refresh is rejected or changes identity', async () => {
    for (const provider of [
      Object.assign(new FakeProvider(), {
        refreshError: new AuthProviderError('INVALID_CREDENTIALS'),
      }),
      Object.assign(new FakeProvider(), {
        refreshSession: {
          ...new FakeProvider().session,
          providerUserId: '00000000-0000-4000-8000-000000000099',
        },
      }),
    ]) {
      const repository = new FakeRepository();
      repository.adminSession = {
        ...storedSession(),
        credentialState: 'set',
        providerTokenExpiresAt: new Date('2026-08-25T03:00:30.000Z'),
      };

      await expect(setup(repository, provider).service.getSession('current-token')).rejects.toEqual(
        new AuthError('SESSION_EXPIRED', 401),
      );
      expect(repository.revokedReason).toBe('provider_invalid');
    }
  });

  it('revokes Core logout even when provider cleanup fails', async () => {
    const repository = new FakeRepository();
    repository.adminSession = storedSession();
    const provider = new FakeProvider();
    provider.isRevokeRejected = true;

    await expect(
      setup(repository, provider).service.logout({ sessionToken: 'current-token' }),
    ).resolves.toBeUndefined();
    expect(repository.revokedReason).toBe('logout');
  });
});
