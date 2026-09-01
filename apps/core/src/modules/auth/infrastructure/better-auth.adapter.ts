import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { createLocalAccountIssuer } from 'better-auth/db';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import type { PrismaClient } from '@prisma/client';
import { AuthProvider, AuthProviderError, type ProviderSession } from '../application/auth.ports';
import type {
  AdminProvisioningProvider,
  ProvisionedProviderIdentity,
} from '../application/admin-provisioning.ports';
import type { StudentIdentityProvider } from '../../roster/application/roster.ports';

type BetterAuthContext = {
  internalAdapter: {
    createUser(
      input: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<{ id: string }>;
    createAccount(input: Record<string, unknown>): Promise<unknown>;
    findSession(token: string): Promise<{ session: { userId: string; expiresAt: Date } } | null>;
    deleteSession(token: string): Promise<void>;
    deleteUserSessions(userId: string): Promise<void>;
    findUserByEmail(
      email: string,
      options?: Record<string, unknown>,
    ): Promise<{
      user: { id: string };
      accounts?: Array<{ providerId: string; password?: string | null }>;
    } | null>;
    updatePassword(userId: string, password: string): Promise<void>;
  };
  password: {
    hash(value: string): Promise<string>;
    verify(input: { hash: string; password: string }): Promise<boolean>;
  };
};

type BetterAuthApi = {
  signInEmail(input: { body: { email: string; password: string } }): Promise<unknown>;
};

type BetterAuthInstance = {
  $context: Promise<BetterAuthContext>;
  api: BetterAuthApi;
};

function asBetterAuthInstance(value: unknown): BetterAuthInstance {
  return value as BetterAuthInstance;
}

export class BetterAuthEngine {
  readonly auth: BetterAuthInstance;
  private readonly logger = new Logger(BetterAuthEngine.name);
  private lastSessionCleanupAt = 0;
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient, options: { baseUrl: string; secret: string }) {
    this.prisma = prisma;
    this.auth = asBetterAuthInstance(
      betterAuth({
        appName: 'Student Showcase',
        baseURL: options.baseUrl,
        database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
        secret: options.secret,
        emailAndPassword: { enabled: true, disableSignUp: true },
        advanced: { database: { generateId: 'uuid' }, useSecureCookies: true },
      }),
    );
  }

  async authenticate(identity: string, password: string): Promise<ProviderSession> {
    try {
      const result = asRecord(
        await this.auth.api.signInEmail({ body: { email: identity, password } }),
      );
      const user = asRecord(result.user);
      const token = typeof result.token === 'string' ? result.token : null;
      const providerUserId = typeof user.id === 'string' ? user.id : null;
      if (token === null || providerUserId === null) throw new Error('invalid response');
      await this.cleanupExpiredSessions();
      return {
        accessToken: token,
        refreshToken: token,
        providerUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      };
    } catch (error: unknown) {
      throw new AuthProviderError(
        isAuthFailure(error) ? 'INVALID_CREDENTIALS' : 'PROVIDER_UNAVAILABLE',
        { cause: error },
      );
    }
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSessionCleanupAt < 60_000) return;
    this.lastSessionCleanupAt = now;
    try {
      await this.prisma.$executeRaw`
        delete from private.session where id in (
          select id from private.session
          where expires_at < ${new Date(now)}
          order by expires_at
          limit 5000
        )
      `;
    } catch (error: unknown) {
      this.logger.warn({
        errorCode: 'BETTER_AUTH_SESSION_CLEANUP_FAILED',
        operation: 'better_auth_session_cleanup',
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  async changePassword(accessToken: string, newPassword: string): Promise<void> {
    const context = await this.auth.$context;
    const session = await context.internalAdapter.findSession(accessToken);
    if (session === null) throw new AuthProviderError('PROVIDER_REJECTED');
    await context.internalAdapter.updatePassword(
      session.session.userId,
      await context.password.hash(newPassword),
    );
    await context.internalAdapter.deleteUserSessions(session.session.userId);
  }

  async refresh(refreshToken: string): Promise<ProviderSession> {
    const context = await this.auth.$context;
    const session = await context.internalAdapter.findSession(refreshToken);
    if (session === null || session.session.expiresAt.getTime() <= Date.now()) {
      throw new AuthProviderError('PROVIDER_REJECTED');
    }
    return {
      accessToken: refreshToken,
      refreshToken,
      providerUserId: session.session.userId,
      expiresAt: session.session.expiresAt,
    };
  }

  async revoke(accessToken: string, scope: 'global' | 'local'): Promise<void> {
    const context = await this.auth.$context;
    if (scope === 'global') {
      const session = await context.internalAdapter.findSession(accessToken);
      if (session !== null) {
        await context.internalAdapter.deleteUserSessions(session.session.userId);
      }
      return;
    }
    await context.internalAdapter.deleteSession(accessToken);
  }

  async provision(input: {
    password: string;
    syntheticIdentity: string;
    providerUserId?: string;
  }): Promise<ProvisionedProviderIdentity> {
    const context = await this.auth.$context;
    const existing = await context.internalAdapter.findUserByEmail(input.syntheticIdentity, {
      includeAccounts: true,
    });
    if (existing !== null) {
      if (input.providerUserId !== undefined && existing.user.id !== input.providerUserId) {
        throw new Error('AUTH_IDENTITY_MISMATCH');
      }
      if (existing.accounts?.some((account) => account.providerId === 'credential') === true) {
        return { providerUserId: existing.user.id };
      } else {
        const password = await context.password.hash(input.password);
        await context.internalAdapter.createAccount({
          id: randomUUID(),
          accountId: existing.user.id,
          issuer: createLocalAccountIssuer('credential'),
          password,
          providerId: 'credential',
          userId: existing.user.id,
        });
      }
      return { providerUserId: existing.user.id };
    }
    const userId = input.providerUserId ?? randomUUID();
    const user = await context.internalAdapter.createUser({
      id: userId,
      email: input.syntheticIdentity,
      emailVerified: true,
      name: input.syntheticIdentity,
    });
    await context.internalAdapter.createAccount({
      id: randomUUID(),
      accountId: user.id,
      issuer: createLocalAccountIssuer('credential'),
      password: await context.password.hash(input.password),
      providerId: 'credential',
      userId: user.id,
    });
    return { providerUserId: user.id };
  }

  async deleteIdentity(providerUserId: string): Promise<void> {
    const context = await this.auth.$context;
    const adapter = context.internalAdapter as unknown as {
      deleteUser(userId: string): Promise<void>;
    };
    await adapter.deleteUser(providerUserId);
  }

  async changePasswordForUser(providerUserId: string, newPassword: string): Promise<void> {
    const context = await this.auth.$context;
    await context.internalAdapter.updatePassword(
      providerUserId,
      await context.password.hash(newPassword),
    );
    await context.internalAdapter.deleteUserSessions(providerUserId);
  }
}

export class BetterAuthProvider implements AuthProvider {
  constructor(private readonly engine: BetterAuthEngine) {}
  authenticate(identity: string, password: string) {
    return this.engine.authenticate(identity, password);
  }
  changePassword(accessToken: string, newPassword: string) {
    return this.engine.changePassword(accessToken, newPassword);
  }
  refresh(refreshToken: string) {
    return this.engine.refresh(refreshToken);
  }
  revoke(accessToken: string, scope: 'global' | 'local') {
    return this.engine.revoke(accessToken, scope);
  }
}

export class BetterAuthAdminProvisioningProvider implements AdminProvisioningProvider {
  constructor(private readonly engine: BetterAuthEngine) {}
  createIdentity(input: { password: string; syntheticIdentity: string }) {
    return this.engine.provision(input);
  }
  deleteIdentity(providerUserId: string) {
    return this.engine.deleteIdentity(providerUserId);
  }
  resetPassword(providerUserId: string, temporaryPassword: string) {
    return this.engine.changePasswordForUser(providerUserId, temporaryPassword);
  }
}

export class BetterAuthStudentIdentityProvider implements StudentIdentityProvider {
  constructor(private readonly engine: BetterAuthEngine) {}
  async ensureIdentity(input: {
    password: string;
    providerUserId: string;
    syntheticIdentity: string;
  }): Promise<void> {
    await this.engine.provision(input);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function isAuthFailure(error: unknown): boolean {
  const code = asRecord(error).statusCode;
  return code === 400 || code === 401;
}
