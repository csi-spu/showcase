import {
  AdminAuthenticationSessionRecord,
  AdminLoginAccount,
  AuthProvider,
  AuthProviderError,
  AuthRepository,
  AuthenticationSessionRecord,
  Clock,
  IdentityProtector,
  LoginAccount,
  NewAuthenticationSession,
  ProviderSession,
  TokenGenerator,
} from './auth.ports';
import { AuthError } from './auth.error';
import { StudentCollectionAuthService } from './student-collection-auth.service';

class FakeAuthProvider implements AuthProvider {
  currentPassword = '69000001';
  readonly session: ProviderSession = {
    accessToken: 'provider-access-token',
    expiresAt: new Date('2026-08-24T13:00:00.000Z'),
    providerUserId: '00000000-0000-4000-8000-000000000031',
    refreshToken: 'provider-refresh-token',
  };
  revokedAccessToken: string | null = null;

  authenticate(identity: string, password: string): Promise<ProviderSession> {
    if (identity !== 'student-hash@auth.invalid' || password !== this.currentPassword) {
      return Promise.reject(new AuthProviderError('INVALID_CREDENTIALS'));
    }
    return Promise.resolve(this.session);
  }

  changePassword(_accessToken: string, newPassword: string): Promise<void> {
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
    accountId: '00000000-0000-4000-8000-000000000032',
    accountStatus: 'active',
    credentialState: 'initial',
    currentAcademicYear: 2569,
    entryYear: 2569,
    hasStudentRole: true,
    providerUserId: '00000000-0000-4000-8000-000000000031',
    studentAccessEndsAcademicYear: 2576,
    studentIdHash: 'student-hash',
    syntheticIdentity: 'student-hash@auth.invalid',
  };
  collectionSession: AuthenticationSessionRecord | null = null;
  createdSession: NewAuthenticationSession | null = null;
  rateLimitResult = { isAllowed: true, retryAfterSeconds: 0 };
  replacedSession: NewAuthenticationSession | null = null;
  revokedSessionIdHash: string | null = null;

  consumeLoginAttempt(): Promise<{ isAllowed: boolean; retryAfterSeconds: number }> {
    return Promise.resolve(this.rateLimitResult);
  }

  createSession(input: NewAuthenticationSession): Promise<void> {
    this.createdSession = input;
    return Promise.resolve();
  }

  findAdminLoginAccount(): Promise<AdminLoginAccount | null> {
    return Promise.resolve(null);
  }

  findAdminSession(): Promise<AdminAuthenticationSessionRecord | null> {
    return Promise.resolve(null);
  }

  findInstructorSession(): Promise<null> {
    return Promise.resolve(null);
  }

  findLoginAccount(studentIdHash: string): Promise<LoginAccount | null> {
    return Promise.resolve(studentIdHash === 'student-hash' ? this.account : null);
  }

  findSession(): Promise<AuthenticationSessionRecord | null> {
    return Promise.resolve(null);
  }

  findStudentCollectionSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null> {
    return Promise.resolve(
      sessionIdHash === this.collectionSession?.sessionIdHash ? this.collectionSession : null,
    );
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

  updateProviderSession(): Promise<void> {
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
  const tokenGenerator: TokenGenerator = { generate: () => 'collection-session-token' };
  return {
    provider,
    repository,
    service: new StudentCollectionAuthService(
      repository,
      provider,
      clock,
      identityProtector,
      tokenGenerator,
    ),
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
    sessionIdHash: 'hashed-current-token',
  };
}

describe('StudentCollectionAuthService login', () => {
  it('creates a Student-collection-audience session, separate from the Showcase Student session', async () => {
    const { repository, service } = createService();

    await expect(
      service.login({ password: '69000001', sourceAddress: '192.0.2.1', studentId: '69000001' }),
    ).resolves.toEqual({
      sessionState: 'password_change_required',
      sessionToken: 'collection-session-token',
    });
    expect(repository.createdSession).toMatchObject({
      accountId: '00000000-0000-4000-8000-000000000032',
      audience: 'student_collection',
      eventType: 'student_collection_login',
    });
  });

  it('rejects a suspended or role-less Account and a wrong password identically', async () => {
    const suspended = new FakeAuthRepository();
    suspended.account = { ...suspended.account!, accountStatus: 'suspended' };
    const roleless = new FakeAuthRepository();
    roleless.account = { ...roleless.account!, hasStudentRole: false };

    for (const repository of [suspended, roleless]) {
      await expect(
        createService(repository).service.login({
          password: '69000001',
          sourceAddress: '192.0.2.1',
          studentId: '69000001',
        }),
      ).rejects.toEqual(new AuthError('INVALID_CREDENTIALS', 401));
    }
    await expect(
      createService().service.login({
        password: 'wrong-password',
        sourceAddress: '192.0.2.1',
        studentId: '69000001',
      }),
    ).rejects.toEqual(new AuthError('INVALID_CREDENTIALS', 401));
  });
});

describe('StudentCollectionAuthService session lifecycle', () => {
  it('rejects a Showcase-Student-audience token because this repository lookup cannot resolve it', async () => {
    await expect(createService().service.getSession('other-surface-token')).rejects.toEqual(
      new AuthError('SESSION_EXPIRED', 401),
    );
  });

  it('rotates the session after a password change', async () => {
    const repository = new FakeAuthRepository();
    repository.collectionSession = createStoredSession();

    await expect(
      createService(repository).service.changePassword({
        currentPassword: '69000001',
        newPassword: 'Correct horse battery 1!',
        sessionToken: 'current-token',
      }),
    ).resolves.toEqual({
      sessionState: 'active',
      sessionToken: 'collection-session-token',
    });
    expect(repository.replacedSession).toMatchObject({
      audience: 'student_collection',
      eventType: 'student_collection_password_changed',
    });
  });

  it('rejects a password missing a character class without rotating the session', async () => {
    const repository = new FakeAuthRepository();
    repository.collectionSession = createStoredSession();

    await expect(
      createService(repository).service.changePassword({
        currentPassword: '69000001',
        newPassword: 'correct horse battery staple',
        sessionToken: 'current-token',
      }),
    ).rejects.toEqual(new AuthError('PASSWORD_MISSING_CHARACTER_CLASS', 422));
    expect(repository.replacedSession).toBeNull();
  });

  it('revokes the session on logout', async () => {
    const repository = new FakeAuthRepository();
    repository.collectionSession = createStoredSession();

    await expect(
      createService(repository).service.logout({ sessionToken: 'current-token' }),
    ).resolves.toBeUndefined();
    expect(repository.revokedSessionIdHash).toBe('hashed-current-token');
  });
});
