import { Inject, Injectable } from '@nestjs/common';
import { evaluatePasswordChange } from '../domain/password-policy';
import { evaluateStudentAccess } from '../domain/student-access-policy';
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
const STUDENT_COLLECTION_ABSOLUTE_SESSION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const STUDENT_COLLECTION_INACTIVITY_SESSION_MILLISECONDS = 24 * 60 * 60 * 1_000;

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

export interface StudentCollectionSessionResult {
  sessionState: 'active' | 'password_change_required';
  sessionToken: string;
}

export type StudentCollectionSessionStatusResult = Omit<
  StudentCollectionSessionResult,
  'sessionToken'
>;

/**
 * The Student-collection frontend is a second BFF surface for the same
 * Student Accounts and Student ID identity used by the existing Showcase
 * Student app — only the session audience/cookie differs, so a Student can
 * hold an active session on both surfaces at once without cross-cookie
 * sharing.
 */
@Injectable()
export class StudentCollectionAuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
    @Inject(AUTH_TOKEN_GENERATOR) private readonly tokenGenerator: TokenGenerator,
  ) {}

  async login(input: LoginInput): Promise<StudentCollectionSessionResult> {
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
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503);
      }
      throw new AuthError('INVALID_CREDENTIALS', 401);
    }

    const account = await this.repository.findLoginAccount(studentIdHash);
    if (!this.isAuthenticatableStudentAccount(account, providerSession.providerUserId)) {
      await this.revokeRejectedProviderSession(providerSession.accessToken);
      throw new AuthError('INVALID_CREDENTIALS', 401);
    }

    const sessionToken = this.tokenGenerator.generate(32);
    const session: NewAuthenticationSession = {
      absoluteExpiresAt: new Date(now.getTime() + STUDENT_COLLECTION_ABSOLUTE_SESSION_MILLISECONDS),
      accountId: account.accountId,
      audience: 'student_collection',
      eventType: 'student_collection_login',
      now,
      providerSession,
      sessionIdHash: this.identityProtector.hashSessionToken(sessionToken),
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
    };
    await this.repository.createSession(session);

    return {
      sessionState: account.credentialState === 'set' ? 'active' : 'password_change_required',
      sessionToken,
    };
  }

  async changePassword(input: ChangePasswordInput): Promise<StudentCollectionSessionResult> {
    const now = this.clock.now();
    const currentSession = await this.resolveCurrentSession(input.sessionToken, now);

    const policy = evaluatePasswordChange({
      currentPassword: input.currentPassword,
      isStudentId:
        this.identityProtector.hashStudentId(input.newPassword) === currentSession.studentIdHash,
      newPassword: input.newPassword,
    });
    if (!policy.isValid) {
      throw new AuthError('INVALID_PASSWORD', 422);
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
      throw new AuthError('INVALID_CREDENTIALS', 401);
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
      absoluteExpiresAt: new Date(now.getTime() + STUDENT_COLLECTION_ABSOLUTE_SESSION_MILLISECONDS),
      accountId: currentSession.accountId,
      audience: 'student_collection',
      eventType: 'student_collection_password_changed',
      now,
      providerSession,
      sessionIdHash: this.identityProtector.hashSessionToken(sessionToken),
    });

    return { sessionState: 'active', sessionToken };
  }

  async getSession(sessionToken: string): Promise<StudentCollectionSessionStatusResult> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(sessionToken, now);
    await this.refreshProviderSessionIfRequired(session, now);
    return {
      sessionState: session.credentialState === 'set' ? 'active' : 'password_change_required',
    };
  }

  async authorizeRead(sessionToken: string): Promise<{ accountId: string }> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(sessionToken, now);
    if (session.credentialState !== 'set') throw new AuthError('FORBIDDEN', 403);
    await this.refreshProviderSessionIfRequired(session, now);
    return { accountId: session.accountId };
  }

  async authorizeMutation(sessionToken: string): Promise<{ accountId: string }> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(sessionToken, now);
    const access = evaluateStudentAccess({
      accessEndsAcademicYear: session.studentAccessEndsAcademicYear,
      currentAcademicYear: session.currentAcademicYear,
      entryYear: session.entryYear,
    });
    if (session.credentialState !== 'set' || !access.canUseStudentCapabilities) {
      throw new AuthError('FORBIDDEN', 403);
    }
    await this.refreshProviderSessionIfRequired(session, now);
    return { accountId: session.accountId };
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
        throw new AuthError('INVALID_CREDENTIALS', 401);
      }

      if (error.code === 'PROVIDER_UNAVAILABLE' || isProviderFailure) {
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503);
      }
    }

    throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503);
  }

  private async resolveCurrentSession(
    sessionToken: string,
    now: Date,
  ): Promise<AuthenticationSessionRecord> {
    const sessionIdHash = this.identityProtector.hashSessionToken(sessionToken);
    const session = await this.repository.findStudentCollectionSession(sessionIdHash);
    const hasExpired =
      session !== null &&
      (session.absoluteExpiresAt.getTime() <= now.getTime() ||
        session.lastActivityAt.getTime() + STUDENT_COLLECTION_INACTIVITY_SESSION_MILLISECONDS <=
          now.getTime());

    if (session === null || session.revokedAt !== null || hasExpired) {
      if (session !== null && session.revokedAt === null) {
        await this.repository.revokeSession(sessionIdHash, now, 'expired');
      }
      throw new AuthError('SESSION_EXPIRED', 401);
    }

    if (
      session.accountStatus !== 'active' ||
      !session.hasStudentRole ||
      session.providerUserId.length === 0
    ) {
      await this.repository.revokeSession(sessionIdHash, now, 'authorization_changed');
      throw new AuthError('UNAUTHENTICATED', 401);
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
        throw new AuthError('SESSION_EXPIRED', 401);
      }
      await this.repository.updateProviderSession(session.sessionIdHash, refreshed, now);
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof AuthProviderError && error.code === 'PROVIDER_UNAVAILABLE') {
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503);
      }
      await this.repository.revokeSession(session.sessionIdHash, now, 'provider_invalid');
      throw new AuthError('SESSION_EXPIRED', 401);
    }
  }
}
