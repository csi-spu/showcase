export const ADMIN_PROVISIONING_PROVIDER = Symbol('ADMIN_PROVISIONING_PROVIDER');
export const ADMIN_PROVISIONING_REPOSITORY = Symbol('ADMIN_PROVISIONING_REPOSITORY');

export interface ProvisionedProviderIdentity {
  providerUserId: string;
}

export interface AdminProvisioningProvider {
  createIdentity(input: {
    password: string;
    syntheticIdentity: string;
  }): Promise<ProvisionedProviderIdentity>;
  deleteIdentity(providerUserId: string): Promise<void>;
}

export class AdminLoginTakenError extends Error {
  constructor() {
    super('ADMIN_LOGIN_TAKEN');
    this.name = 'AdminLoginTakenError';
  }
}

export interface AdminProvisioningRepository {
  adminLoginExists(adminLoginHash: string): Promise<boolean>;
  createAdminAccount(input: {
    adminLoginHash: string;
    firstNameTh: string;
    lastNameTh: string;
    now: Date;
    providerUserId: string;
    syntheticIdentity: string;
  }): Promise<{ accountId: string }>;
}
