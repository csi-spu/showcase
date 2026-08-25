import { Inject, Injectable } from '@nestjs/common';
import { evaluatePasswordChange } from '../domain/password-policy';
import { AuthError } from './auth.error';
import {
  AUTH_CLOCK,
  AUTH_IDENTITY_PROTECTOR,
  AUTH_PROVIDER,
  AUTH_REPOSITORY,
  AUTH_TOKEN_GENERATOR,
  AuthProviderError,
} from './auth.ports';
import type {
  AuthenticationSessionRecord,
  AuthProvider,
  AuthRepository,
  Clock,
  IdentityProtector,
  LoginAccount,
  NewAuthenticationSession,
  TokenGenerator,
} from './auth.ports';

const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_SECONDS = 15 * 60;
const STUDENT_ABSOLUTE_SESSION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const STUDENT_INACTIVITY_SESSION_MILLISECONDS = 24 * 60 * 60 * 1_000;

interface LoginInput {
  password: string;
  sourceAddress: string;
  studentId: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  sessionToken: string;
}

interface LogoutInput {
  sessionToken: string;
}

export interface StudentSessionResult {
  canUseStudentCapabilities: boolean;
  sessionState: 'active' | 'password_change_required';
  sessionToken: string;
}

export type StudentSessionStatusResult = Omit<StudentSessionResult, 'sessionToken'>;

@Injectable()
export class StudentAuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
    @Inject(AUTH_TOKEN_GENERATOR) private readonly tokenGenerator: TokenGenerator,
  ) {}

  async login(input: LoginInput): Promise<StudentSessionResult> {
    const now = this.clock.now();
    const studentIdHash = this.identityProtector.hashStudentId(input.studentId);
    const rateLimit = await this.repository.consumeLoginAttempt({
      accountKeyHash: studentIdHash,
      limit: LOGIN_RATE_LIMIT,
      now,
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
      windowSeconds: LOGIN_RATE_WINDOW_SECONDS,
    });

    if (!rateLimit.isAllowed) {
      throw new AuthError('RATE_LIMITED', 429, rateLimit.retryAfterSeconds);
    }

    const syntheticIdentity = this.identityProtector.toSyntheticIdentity(input.studentId);
    let providerSession;

    try {
      providerSession = await this.provider.authenticate(syntheticIdentity, input.password);
    } catch (error: unknown) {
      if (error instanceof AuthProviderError && error.code === 'PROVIDER_UNAVAILABLE') {
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503, undefined);
      }

      throw new AuthError('INVALID_CREDENTIALS', 401, undefined);
    }

    const account = await this.repository.findLoginAccount(studentIdHash);
    if (!this.isAuthenticatableStudentAccount(account, providerSession.providerUserId)) {
      await this.revokeRejectedProviderSession(providerSession.accessToken);
      throw new AuthError('INVALID_CREDENTIALS', 401, undefined);
    }

    const sessionToken = this.tokenGenerator.generate(32);
    const session: NewAuthenticationSession = {
      absoluteExpiresAt: new Date(now.getTime() + STUDENT_ABSOLUTE_SESSION_MILLISECONDS),
      accountId: account.accountId,
      audience: 'student',
      eventType: 'student_login',
      now,
      providerSession,
      sessionIdHash: this.identityProtector.hashSessionToken(sessionToken),
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
    };
    await this.repository.createSession(session);

    const isPasswordChangeRequired = account.credentialState !== 'set';
    return {
      canUseStudentCapabilities:
        !isPasswordChangeRequired && this.canUseStudentCapabilities(account),
      sessionState: isPasswordChangeRequired ? 'password_change_required' : 'active',
      sessionToken,
    };
  }

  async changePassword(input: ChangePasswordInput): Promise<StudentSessionResult> {
    const now = this.clock.now();
    const currentSession = await this.resolveCurrentSession(input.sessionToken, now);

    const policy = evaluatePasswordChange({
      currentPassword: input.currentPassword,
      isStudentId:
        this.identityProtector.hashStudentId(input.newPassword) === currentSession.studentIdHash,
      newPassword: input.newPassword,
    });
    if (!policy.isValid) {
      throw new AuthError('INVALID_PASSWORD', 422, undefined);
    }

    let verifiedSession;
    try {
      verifiedSession = await this.provider.authenticate(
        currentSession.syntheticIdentity,
        input.currentPassword,
      );
    } catch (error: unknown) {
      this.mapProviderError(error);
    }

    if (verifiedSession.providerUserId !== currentSession.providerUserId) {
      await this.revokeRejectedProviderSession(verifiedSession.accessToken);
      throw new AuthError('INVALID_CREDENTIALS', 401, undefined);
    }

    try {
      await this.provider.changePassword(verifiedSession.accessToken, input.newPassword);
    } catch (error: unknown) {
      this.mapProviderError(error, true);
    }

    let providerSession;
    try {
      providerSession = await this.provider.authenticate(
        currentSession.syntheticIdentity,
        input.newPassword,
      );
    } catch (error: unknown) {
      this.mapProviderError(error, true);
    }

    const sessionToken = this.tokenGenerator.generate(32);
    await this.repository.replaceAllAccountSessions({
      absoluteExpiresAt: new Date(now.getTime() + STUDENT_ABSOLUTE_SESSION_MILLISECONDS),
      accountId: currentSession.accountId,
      audience: 'student',
      eventType: 'student_password_changed',
      now,
      providerSession,
      sessionIdHash: this.identityProtector.hashSessionToken(sessionToken),
    });

    return {
      canUseStudentCapabilities: this.canUseStudentCapabilities(currentSession),
      sessionState: 'active',
      sessionToken,
    };
  }

  async authorizeStudentMutation(sessionToken: string): Promise<{ accountId: string }> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(sessionToken, now);
    if (session.credentialState !== 'set' || !this.canUseStudentCapabilities(session)) {
      throw new AuthError('FORBIDDEN', 403, undefined);
    }
    await this.refreshProviderSessionIfRequired(session, now);
    return { accountId: session.accountId };
  }

  async getSession(sessionToken: string): Promise<StudentSessionStatusResult> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(sessionToken, now);
    await this.refreshProviderSessionIfRequired(session, now);
    const isPasswordChangeRequired = session.credentialState !== 'set';

    return {
      canUseStudentCapabilities:
        !isPasswordChangeRequired && this.canUseStudentCapabilities(session),
      sessionState: isPasswordChangeRequired ? 'password_change_required' : 'active',
    };
  }

  async logout(input: LogoutInput): Promise<void> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(input.sessionToken, now);
    await this.repository.revokeSession(session.sessionIdHash, now, 'logout');

    try {
      await this.provider.revoke(session.providerAccessToken, 'local');
    } catch {
      // The opaque Core session is authoritative and is already revoked.
    }
  }

  private canUseStudentCapabilities(account: LoginAccount): boolean {
    return (
      account.currentAcademicYear !== null &&
      account.currentAcademicYear >= account.entryYear &&
      account.currentAcademicYear <= account.studentAccessEndsAcademicYear
    );
  }

  private isAuthenticatableStudentAccount(
    account: LoginAccount | null,
    providerUserId: string,
  ): account is LoginAccount {
    return (
      account !== null &&
      account.accountStatus === 'active' &&
      account.hasStudentRole &&
      account.providerUserId === providerUserId
    );
  }

  private async revokeRejectedProviderSession(accessToken: string): Promise<void> {
    try {
      await this.provider.revoke(accessToken, 'local');
    } catch {
      // Core rejects the login regardless; provider cleanup is best-effort for a non-owned Account.
    }
  }

  private mapProviderError(error: unknown, isProviderFailure = false): never {
    if (error instanceof AuthProviderError) {
      if (error.code === 'INVALID_CREDENTIALS' && !isProviderFailure) {
        throw new AuthError('INVALID_CREDENTIALS', 401, undefined);
      }

      if (error.code === 'PROVIDER_UNAVAILABLE' || isProviderFailure) {
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503, undefined);
      }
    }

    throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503, undefined);
  }

  private async resolveCurrentSession(
    sessionToken: string,
    now: Date,
  ): Promise<AuthenticationSessionRecord> {
    const sessionIdHash = this.identityProtector.hashSessionToken(sessionToken);
    const session = await this.repository.findSession(sessionIdHash);
    const hasExpired =
      session !== null &&
      (session.absoluteExpiresAt.getTime() <= now.getTime() ||
        session.lastActivityAt.getTime() + STUDENT_INACTIVITY_SESSION_MILLISECONDS <=
          now.getTime());

    if (session === null || session.revokedAt !== null || hasExpired) {
      if (session !== null && session.revokedAt === null) {
        await this.repository.revokeSession(sessionIdHash, now, 'expired');
      }
      throw new AuthError('SESSION_EXPIRED', 401, undefined);
    }

    if (
      session.accountStatus !== 'active' ||
      !session.hasStudentRole ||
      session.providerUserId.length === 0
    ) {
      await this.repository.revokeSession(sessionIdHash, now, 'authorization_changed');
      throw new AuthError('UNAUTHENTICATED', 401, undefined);
    }

    await this.repository.touchSession(sessionIdHash, now);
    return session;
  }

  private async refreshProviderSessionIfRequired(
    session: AuthenticationSessionRecord,
    now: Date,
  ): Promise<void> {
    const refreshThreshold = now.getTime() + 60_000;
    if (session.providerTokenExpiresAt.getTime() > refreshThreshold) {
      return;
    }

    try {
      const refreshed = await this.provider.refresh(session.providerRefreshToken);
      if (refreshed.providerUserId !== session.providerUserId) {
        await this.repository.revokeSession(session.sessionIdHash, now, 'provider_invalid');
        throw new AuthError('SESSION_EXPIRED', 401, undefined);
      }
      await this.repository.updateProviderSession(session.sessionIdHash, refreshed, now);
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof AuthProviderError && error.code === 'PROVIDER_UNAVAILABLE') {
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503, undefined);
      }
      await this.repository.revokeSession(session.sessionIdHash, now, 'provider_invalid');
      throw new AuthError('SESSION_EXPIRED', 401, undefined);
    }
  }
}
