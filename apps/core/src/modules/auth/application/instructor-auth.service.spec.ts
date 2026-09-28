import { AuthError } from './auth.error';
import {
  AdminLoginAccount,
  AuthProvider,
  AuthProviderError,
  AuthRepository,
  Clock,
  IdentityProtector,
  InstructorAuthenticationSessionRecord,
  NewAuthenticationSession,
  ProviderSession,
  TokenGenerator,
} from './auth.ports';
import { InstructorAuthService } from './instructor-auth.service';

const NOW = new Date('2026-08-25T03:00:00.000Z');
const PROVIDER_USER_ID = '00000000-0000-4000-8000-000000000021';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000022';

class FakeProvider implements AuthProvider {
  authenticateError: Error | null = null;
  currentPassword = 'temporary-password-value';
  revokeCalls = 0;
  session: ProviderSession = {
    accessToken: 'instructor-provider-access',
    expiresAt: new Date('2026-08-25T04:00:00.000Z'),
    providerUserId: PROVIDER_USER_ID,
    refreshToken: 'instructor-provider-refresh',
  };

  authenticate(identity: string, password: string): Promise<ProviderSession> {
    if (this.authenticateError !== null) {
      return Promise.reject(this.authenticateError);
    }
    return identity === 'instructor-hash@admin.auth.invalid' && password === this.currentPassword
      ? Promise.resolve(this.session)
      : Promise.reject(new AuthProviderError('INVALID_CREDENTIALS'));
  }

  changePassword(_accessToken: string, newPassword: string): Promise<void> {
    this.currentPassword = newPassword;
    return Promise.resolve();
  }

  refresh(): Promise<ProviderSession> {
    return Promise.resolve(this.session);
  }

  revoke(): Promise<void> {
    this.revokeCalls += 1;
    return Promise.resolve();
  }
}

class FakeRepository implements AuthRepository {
  instructorAccount: AdminLoginAccount | null = {
    accountId: ACCOUNT_ID,
    accountStatus: 'active',
    adminLoginHash: 'instructor-hash',
    credentialState: 'set',
    hasAdminRole: false,
    hasInstructorRole: true,
    providerUserId: PROVIDER_USER_ID,
    syntheticIdentity: 'instructor-hash@admin.auth.invalid',
  };
  instructorSession: InstructorAuthenticationSessionRecord | null = null;
  createdSession: NewAuthenticationSession | null = null;
  rateLimitResult = { isAllowed: true, retryAfterSeconds: 0 };
  replacedSession: NewAuthenticationSession | null = null;
  revokedReason: string | null = null;

  consumeLoginAttempt(): Promise<{ isAllowed: boolean; retryAfterSeconds: number }> {
    return Promise.resolve(this.rateLimitResult);
  }

  createSession(input: NewAuthenticationSession): Promise<void> {
    this.createdSession = input;
    return Promise.resolve();
  }

  findAdminLoginAccount(adminLoginHash: string): Promise<AdminLoginAccount | null> {
    return Promise.resolve(adminLoginHash === 'instructor-hash' ? this.instructorAccount : null);
  }

  findAdminSession(): Promise<null> {
    return Promise.resolve(null);
  }

  findInstructorSession(
    sessionIdHash: string,
  ): Promise<InstructorAuthenticationSessionRecord | null> {
    return Promise.resolve(
      sessionIdHash === this.instructorSession?.sessionIdHash ? this.instructorSession : null,
    );
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
    return Promise.resolve();
  }

  updateProviderSession(): Promise<void> {
    return Promise.resolve();
  }
}

const identityProtector: IdentityProtector = {
  hashAdminLogin: (value) => (value === 'teaching-staff' ? 'instructor-hash' : `hash-${value}`),
  hashSessionToken: (value) => `hashed-${value}`,
  hashSourceAddress: (value) => `source-${value}`,
  hashStudentId: (value) => `student-${value}`,
  toAdminSyntheticIdentity: () => 'instructor-hash@admin.auth.invalid',
  toSyntheticIdentity: () => 'student-hash@auth.invalid',
};

function storedSession(
  account: AdminLoginAccount = new FakeRepository().instructorAccount as AdminLoginAccount,
): InstructorAuthenticationSessionRecord {
  return {
    ...account,
    absoluteExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
    displayName: 'ผู้สอน ทดสอบ',
    lastActivityAt: new Date('2026-08-25T02:31:00.000Z'),
    providerAccessToken: 'instructor-provider-access',
    providerRefreshToken: 'instructor-provider-refresh',
    providerTokenExpiresAt: new Date('2026-08-25T04:00:00.000Z'),
    revokedAt: null,
    sessionIdHash: 'hashed-current-token',
  };
}

function setup(repository = new FakeRepository(), provider = new FakeProvider()) {
  const clock: Clock = { now: () => NOW };
  const tokenGenerator: TokenGenerator = { generate: () => 'new-instructor-session-token' };
  return {
    provider,
    repository,
    service: new InstructorAuthService(
      repository,
      provider,
      clock,
      identityProtector,
      tokenGenerator,
    ),
  };
}

describe('InstructorAuthService login', () => {
  it('creates an Instructor-audience session distinct from Admin', async () => {
    const { repository, service } = setup();

    await expect(
      service.login({
        instructorLogin: 'teaching-staff',
        password: 'temporary-password-value',
        sourceAddress: '192.0.2.30',
      }),
    ).resolves.toEqual({ sessionState: 'active', sessionToken: 'new-instructor-session-token' });
    expect(repository.createdSession).toMatchObject({
      accountId: ACCOUNT_ID,
      audience: 'instructor',
      eventType: 'instructor_login',
    });
  });

  it('rejects an Account that holds Admin access but not the Instructor role', async () => {
    const repository = new FakeRepository();
    repository.instructorAccount = {
      ...repository.instructorAccount!,
      hasAdminRole: true,
      hasInstructorRole: false,
    };

    await expect(
      setup(repository).service.login({
        instructorLogin: 'teaching-staff',
        password: 'temporary-password-value',
        sourceAddress: '192.0.2.30',
      }),
    ).rejects.toEqual(new AuthError('INVALID_CREDENTIALS', 401));
    expect(repository.createdSession).toBeNull();
  });

  it('reports password change required for a temporary credential', async () => {
    const repository = new FakeRepository();
    repository.instructorAccount = { ...repository.instructorAccount!, credentialState: 'initial' };

    await expect(
      setup(repository).service.login({
        instructorLogin: 'teaching-staff',
        password: 'temporary-password-value',
        sourceAddress: '192.0.2.30',
      }),
    ).resolves.toMatchObject({ sessionState: 'password_change_required' });
  });
});

describe('InstructorAuthService authorization and lifecycle', () => {
  it('returns the signed-in Instructor Thai display name only from the session read', async () => {
    const repository = new FakeRepository();
    repository.instructorSession = Object.assign(storedSession(), {
      displayName: 'ผู้สอน ทดสอบ',
    });

    await expect(setup(repository).service.getSession('current-token')).resolves.toEqual({
      displayName: 'ผู้สอน ทดสอบ',
      sessionState: 'active',
    });
  });

  it('returns a null display name when the Instructor has no private name row', async () => {
    const repository = new FakeRepository();
    repository.instructorSession = Object.assign(storedSession(), { displayName: null });

    await expect(setup(repository).service.getSession('current-token')).resolves.toEqual({
      displayName: null,
      sessionState: 'active',
    });
  });

  it('authorizes a valid Instructor session and rejects once the role is revoked', async () => {
    const repository = new FakeRepository();
    repository.instructorSession = storedSession();
    const { service } = setup(repository);

    await expect(service.authorizeInstructor('current-token')).resolves.toEqual({
      accountId: ACCOUNT_ID,
    });

    repository.instructorSession = storedSession({
      ...repository.instructorAccount!,
      hasInstructorRole: false,
    });
    await expect(service.getSession('current-token')).rejects.toEqual(
      new AuthError('UNAUTHENTICATED', 401),
    );
    expect(repository.revokedReason).toBe('authorization_changed');
  });

  it('rejects an Admin-audience token because the Instructor repository cannot resolve it', async () => {
    await expect(setup().service.getSession('admin-session-token')).rejects.toEqual(
      new AuthError('SESSION_EXPIRED', 401),
    );
  });

  it('rotates the session after password change', async () => {
    const repository = new FakeRepository();
    repository.instructorSession = storedSession();
    const { service } = setup(repository);

    await expect(
      service.changePassword({
        currentPassword: 'temporary-password-value',
        newPassword: 'Correct horse battery 1!',
        sessionToken: 'current-token',
      }),
    ).resolves.toEqual({ sessionState: 'active', sessionToken: 'new-instructor-session-token' });
    expect(repository.replacedSession).toMatchObject({
      accountId: ACCOUNT_ID,
      audience: 'instructor',
      eventType: 'instructor_password_changed',
    });
  });

  it('rejects a password missing a character class without rotating the session', async () => {
    const repository = new FakeRepository();
    repository.instructorSession = storedSession();
    const { service } = setup(repository);

    await expect(
      service.changePassword({
        currentPassword: 'temporary-password-value',
        newPassword: 'correct horse battery staple',
        sessionToken: 'current-token',
      }),
    ).rejects.toEqual(new AuthError('PASSWORD_MISSING_CHARACTER_CLASS', 422));
    expect(repository.replacedSession).toBeNull();
  });

  it('revokes Core logout even when provider cleanup fails', async () => {
    const repository = new FakeRepository();
    repository.instructorSession = storedSession();
    const { service } = setup(repository);

    await expect(service.logout({ sessionToken: 'current-token' })).resolves.toBeUndefined();
    expect(repository.revokedReason).toBe('logout');
  });
});
