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
  AdminAuthenticationSessionRecord,
  AdminLoginAccount,
  AuthProvider,
  AuthRepository,
  Clock,
  IdentityProtector,
  NewAuthenticationSession,
  TokenGenerator,
} from './auth.ports';

const INSTRUCTOR_ABSOLUTE_SESSION_MILLISECONDS = 8 * 60 * 60 * 1_000;
const INSTRUCTOR_INACTIVITY_SESSION_MILLISECONDS = 30 * 60 * 1_000;
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_SECONDS = 15 * 60;

interface InstructorLoginInput {
  instructorLogin: string;
  password: string;
  sourceAddress: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  sessionToken: string;
}

interface LogoutInput {
  sessionToken: string;
}

export interface InstructorSessionResult {
  sessionState: 'active' | 'password_change_required';
  sessionToken: string;
}

export type InstructorSessionStatusResult = Omit<InstructorSessionResult, 'sessionToken'>;

/**
 * Instructor login reuses the same staff-identity mechanism as Admin
 * (private.admin_auth_identities, hashAdminLogin/toAdminSyntheticIdentity) so
 * granting Instructor access to an existing Admin Account never creates a
 * second identity or password — only the instructor role/audience differ.
 */
@Injectable()
export class InstructorAuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
    @Inject(AUTH_TOKEN_GENERATOR) private readonly tokenGenerator: TokenGenerator,
  ) {}

  async login(input: InstructorLoginInput): Promise<InstructorSessionResult> {
    const now = this.clock.now();
    const adminLoginHash = this.identityProtector.hashAdminLogin(input.instructorLogin);
    const rateLimit = await this.repository.consumeLoginAttempt({
      accountKeyHash: adminLoginHash,
      limit: LOGIN_RATE_LIMIT,
      now,
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
      windowSeconds: LOGIN_RATE_WINDOW_SECONDS,
    });
    if (!rateLimit.isAllowed) {
      throw new AuthError('RATE_LIMITED', 429, rateLimit.retryAfterSeconds);
    }

    let providerSession;
    try {
      providerSession = await this.provider.authenticate(
        this.identityProtector.toAdminSyntheticIdentity(input.instructorLogin),
        input.password,
      );
    } catch (error: unknown) {
      if (error instanceof AuthProviderError && error.code === 'PROVIDER_UNAVAILABLE') {
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', 503);
      }
      throw new AuthError('INVALID_CREDENTIALS', 401);
    }

    const account = await this.repository.findAdminLoginAccount(adminLoginHash);
    if (!this.isAuthenticatableInstructorAccount(account, providerSession.providerUserId)) {
      await this.revokeRejectedProviderSession(providerSession.accessToken);
      throw new AuthError('INVALID_CREDENTIALS', 401);
    }

    const sessionToken = this.tokenGenerator.generate(32);
    await this.repository.createSession({
      absoluteExpiresAt: new Date(now.getTime() + INSTRUCTOR_ABSOLUTE_SESSION_MILLISECONDS),
      accountId: account.accountId,
      audience: 'instructor',
      eventType: 'instructor_login',
      now,
      providerSession,
      sessionIdHash: this.identityProtector.hashSessionToken(sessionToken),
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
    });

    return {
      sessionState: account.credentialState === 'set' ? 'active' : 'password_change_required',
      sessionToken,
    };
  }

  async changePassword(input: ChangePasswordInput): Promise<InstructorSessionResult> {
    const now = this.clock.now();
    const currentSession = await this.resolveCurrentSession(input.sessionToken, now);
    const policy = evaluatePasswordChange({
      currentPassword: input.currentPassword,
      isStudentId: false,
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
    const session: NewAuthenticationSession = {
      absoluteExpiresAt: new Date(now.getTime() + INSTRUCTOR_ABSOLUTE_SESSION_MILLISECONDS),
      accountId: currentSession.accountId,
      audience: 'instructor',
      eventType: 'instructor_password_changed',
      now,
      providerSession,
      sessionIdHash: this.identityProtector.hashSessionToken(sessionToken),
    };
    await this.repository.replaceAllAccountSessions(session);
    return { sessionState: 'active', sessionToken };
  }

  async authorizeInstructor(sessionToken: string): Promise<{ accountId: string }> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(sessionToken, now);
    if (session.credentialState !== 'set') {
      throw new AuthError('FORBIDDEN', 403);
    }
    await this.refreshProviderSessionIfRequired(session, now);
    return { accountId: session.accountId };
  }

  async getSession(sessionToken: string): Promise<InstructorSessionStatusResult> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(sessionToken, now);
    await this.refreshProviderSessionIfRequired(session, now);
    return {
      sessionState: session.credentialState === 'set' ? 'active' : 'password_change_required',
    };
  }

  async logout(input: LogoutInput): Promise<void> {
    const now = this.clock.now();
    const session = await this.resolveCurrentSession(input.sessionToken, now);
    await this.repository.revokeSession(session.sessionIdHash, now, 'logout');
    try {
      await this.provider.revoke(session.providerAccessToken, 'local');
    } catch {
      // The Core session is authoritative and has already been revoked.
    }
  }

  private isAuthenticatableInstructorAccount(
    account: AdminLoginAccount | null,
    providerUserId: string,
  ): account is AdminLoginAccount {
    return (
      account !== null &&
      account.accountStatus === 'active' &&
      account.hasInstructorRole &&
      account.providerUserId === providerUserId
    );
  }

  private async resolveCurrentSession(
    sessionToken: string,
    now: Date,
  ): Promise<AdminAuthenticationSessionRecord> {
    const sessionIdHash = this.identityProtector.hashSessionToken(sessionToken);
    const session = await this.repository.findInstructorSession(sessionIdHash);
    const hasExpired =
      session !== null &&
      (session.absoluteExpiresAt.getTime() <= now.getTime() ||
        session.lastActivityAt.getTime() + INSTRUCTOR_INACTIVITY_SESSION_MILLISECONDS <=
          now.getTime());
    if (session === null || session.revokedAt !== null || hasExpired) {
      if (session !== null && session.revokedAt === null) {
        await this.repository.revokeSession(sessionIdHash, now, 'expired');
      }
      throw new AuthError('SESSION_EXPIRED', 401);
    }
    if (
      session.accountStatus !== 'active' ||
      !session.hasInstructorRole ||
      session.providerUserId.length === 0
    ) {
      await this.repository.revokeSession(sessionIdHash, now, 'authorization_changed');
      throw new AuthError('UNAUTHENTICATED', 401);
    }
    await this.repository.touchSession(sessionIdHash, now);
    return session;
  }

  private async refreshProviderSessionIfRequired(
    session: AdminAuthenticationSessionRecord,
    now: Date,
  ): Promise<void> {
    if (session.providerTokenExpiresAt.getTime() > now.getTime() + 60_000) {
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

  private async revokeRejectedProviderSession(accessToken: string): Promise<void> {
    try {
      await this.provider.revoke(accessToken, 'local');
    } catch {
      // Core rejects authorization regardless; provider cleanup is best effort.
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
}
