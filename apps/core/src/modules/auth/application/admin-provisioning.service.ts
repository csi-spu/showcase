import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_CLOCK, AUTH_IDENTITY_PROTECTOR, AUTH_TOKEN_GENERATOR } from './auth.ports';
import type { Clock, IdentityProtector, TokenGenerator } from './auth.ports';
import {
  ADMIN_PROVISIONING_PROVIDER,
  ADMIN_PROVISIONING_REPOSITORY,
  AdminLoginTakenError,
} from './admin-provisioning.ports';
import type {
  AdminProvisioningProvider,
  AdminProvisioningRepository,
} from './admin-provisioning.ports';

export type AdminProvisioningErrorCode =
  | 'ADMIN_LOGIN_TAKEN'
  | 'ADMIN_PROVIDER_UNAVAILABLE'
  | 'ADMIN_PROVISIONING_FAILED'
  | 'ADMIN_PROVISIONING_REQUIRES_RECONCILIATION'
  | 'INVALID_ADMIN_LOGIN'
  | 'INVALID_ADMIN_NAME';

export class AdminProvisioningError extends Error {
  constructor(readonly code: AdminProvisioningErrorCode) {
    super(code);
    this.name = 'AdminProvisioningError';
  }
}

@Injectable()
export class AdminProvisioningService {
  private readonly logger = new Logger(AdminProvisioningService.name);

  constructor(
    @Inject(ADMIN_PROVISIONING_REPOSITORY)
    private readonly repository: AdminProvisioningRepository,
    @Inject(ADMIN_PROVISIONING_PROVIDER)
    private readonly provider: AdminProvisioningProvider,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
    @Inject(AUTH_TOKEN_GENERATOR) private readonly tokenGenerator: TokenGenerator,
  ) {}

  async provision(input: {
    adminLogin: string;
    firstNameTh: string;
    lastNameTh: string;
  }): Promise<{ adminLogin: string; temporaryPassword: string }> {
    const adminLogin = input.adminLogin.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(adminLogin)) {
      throw new AdminProvisioningError('INVALID_ADMIN_LOGIN');
    }
    const firstNameTh = input.firstNameTh.trim().normalize('NFC');
    const lastNameTh = input.lastNameTh.trim().normalize('NFC');
    if (
      firstNameTh.length === 0 ||
      firstNameTh.length > 100 ||
      lastNameTh.length === 0 ||
      lastNameTh.length > 100
    ) {
      throw new AdminProvisioningError('INVALID_ADMIN_NAME');
    }

    const adminLoginHash = this.identityProtector.hashAdminLogin(adminLogin);
    if (await this.repository.adminLoginExists(adminLoginHash)) {
      throw new AdminProvisioningError('ADMIN_LOGIN_TAKEN');
    }

    const temporaryPassword = this.tokenGenerator.generate(24);
    const syntheticIdentity = this.identityProtector.toAdminSyntheticIdentity(adminLogin);
    let providerIdentity;
    try {
      providerIdentity = await this.provider.createIdentity({
        password: temporaryPassword,
        syntheticIdentity,
      });
    } catch {
      this.logFailure('ADMIN_PROVIDER_UNAVAILABLE');
      throw new AdminProvisioningError('ADMIN_PROVIDER_UNAVAILABLE');
    }

    try {
      await this.repository.createAdminAccount({
        adminLoginHash,
        firstNameTh,
        lastNameTh,
        now: this.clock.now(),
        providerUserId: providerIdentity.providerUserId,
        syntheticIdentity,
      });
    } catch (error: unknown) {
      const isLoginTaken = error instanceof AdminLoginTakenError;
      try {
        await this.provider.deleteIdentity(providerIdentity.providerUserId);
      } catch {
        this.logFailure('ADMIN_PROVISIONING_REQUIRES_RECONCILIATION');
        throw new AdminProvisioningError('ADMIN_PROVISIONING_REQUIRES_RECONCILIATION');
      }
      if (isLoginTaken) {
        throw new AdminProvisioningError('ADMIN_LOGIN_TAKEN');
      }
      this.logFailure('ADMIN_PROVISIONING_FAILED');
      throw new AdminProvisioningError('ADMIN_PROVISIONING_FAILED');
    }

    return { adminLogin, temporaryPassword };
  }

  private logFailure(errorCode: AdminProvisioningErrorCode): void {
    this.logger.error({ errorCode, operation: 'admin_provisioning' });
  }
}
