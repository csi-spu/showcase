import { Logger } from '@nestjs/common';
import { Clock, IdentityProtector, TokenGenerator } from './auth.ports';
import {
  AdminLoginTakenError,
  AdminProvisioningProvider,
  AdminProvisioningRepository,
  ProvisionedProviderIdentity,
} from './admin-provisioning.ports';
import { AdminProvisioningError, AdminProvisioningService } from './admin-provisioning.service';

class FakeProvider implements AdminProvisioningProvider {
  createdInput: { password: string; syntheticIdentity: string } | null = null;
  createError: Error | null = null;
  deleteError: Error | null = null;
  deletedProviderUserId: string | null = null;
  readonly identity: ProvisionedProviderIdentity = {
    providerUserId: '30000000-0000-4000-8000-000000000001',
  };

  createIdentity(input: {
    password: string;
    syntheticIdentity: string;
  }): Promise<ProvisionedProviderIdentity> {
    this.createdInput = input;
    return this.createError === null
      ? Promise.resolve(this.identity)
      : Promise.reject(this.createError);
  }

  deleteIdentity(providerUserId: string): Promise<void> {
    this.deletedProviderUserId = providerUserId;
    return this.deleteError === null ? Promise.resolve() : Promise.reject(this.deleteError);
  }
}

class FakeRepository implements AdminProvisioningRepository {
  createdInput: Parameters<AdminProvisioningRepository['createAdminAccount']>[0] | null = null;
  createError: Error | null = null;
  loginExists = false;

  adminLoginExists(): Promise<boolean> {
    return Promise.resolve(this.loginExists);
  }

  createAdminAccount(
    input: Parameters<AdminProvisioningRepository['createAdminAccount']>[0],
  ): Promise<{ accountId: string }> {
    this.createdInput = input;
    return this.createError === null
      ? Promise.resolve({ accountId: '30000000-0000-4000-8000-000000000002' })
      : Promise.reject(this.createError);
  }
}

const clock: Clock = { now: () => new Date('2026-08-25T04:00:00.000Z') };
const identityProtector: IdentityProtector = {
  hashAdminLogin: (value) => `hash-${value}`,
  hashSessionToken: (value) => `session-${value}`,
  hashSourceAddress: (value) => `source-${value}`,
  hashStudentId: (value) => `student-${value}`,
  toAdminSyntheticIdentity: (value) => `hash-${value}@admin.auth.invalid`,
  toSyntheticIdentity: (value) => `student-${value}@auth.invalid`,
};
const tokenGenerator: TokenGenerator = {
  generate: (bytes) => `random-${bytes}-byte-password-value`,
};

function setup(repository = new FakeRepository(), provider = new FakeProvider()) {
  return {
    provider,
    repository,
    service: new AdminProvisioningService(
      repository,
      provider,
      clock,
      identityProtector,
      tokenGenerator,
    ),
  };
}

describe('AdminProvisioningService', () => {
  let loggerErrorSpy: jest.SpiedFunction<typeof Logger.prototype.error>;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes a private login and returns a random temporary password only after audit persistence', async () => {
    const { provider, repository, service } = setup();

    await expect(
      service.provision({
        adminLogin: '  Operations.Team  ',
        firstNameTh: '  สมชาย  ',
        lastNameTh: '  ใจดี  ',
      }),
    ).resolves.toEqual({
      adminLogin: 'operations.team',
      temporaryPassword: 'random-24-byte-password-value',
    });
    expect(provider.createdInput).toEqual({
      password: 'random-24-byte-password-value',
      syntheticIdentity: 'hash-operations.team@admin.auth.invalid',
    });
    expect(repository.createdInput).toEqual({
      adminLoginHash: 'hash-operations.team',
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      now: new Date('2026-08-25T04:00:00.000Z'),
      providerUserId: provider.identity.providerUserId,
      syntheticIdentity: 'hash-operations.team@admin.auth.invalid',
    });
  });

  it.each(['ab', 'contains space', 'x'.repeat(65), 'ผู้ดูแล'])(
    'rejects invalid login %s before side effects',
    async (adminLogin) => {
      const { provider, repository, service } = setup();

      await expect(
        service.provision({ adminLogin, firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' }),
      ).rejects.toEqual(new AdminProvisioningError('INVALID_ADMIN_LOGIN'));
      expect(provider.createdInput).toBeNull();
      expect(repository.createdInput).toBeNull();
    },
  );

  it.each(['', ' ', 'x'.repeat(101)])(
    'rejects invalid Thai name %s before side effects',
    async (firstNameTh) => {
      const { provider, repository, service } = setup();

      await expect(
        service.provision({ adminLogin: 'ops', firstNameTh, lastNameTh: 'ใจดี' }),
      ).rejects.toEqual(new AdminProvisioningError('INVALID_ADMIN_NAME'));
      expect(provider.createdInput).toBeNull();
      expect(repository.createdInput).toBeNull();
    },
  );

  it('rejects a login that already exists before creating a provider identity', async () => {
    const repository = new FakeRepository();
    repository.loginExists = true;
    const { provider, repository: usedRepository, service } = setup(repository);

    await expect(
      service.provision({ adminLogin: 'ops', firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' }),
    ).rejects.toEqual(new AdminProvisioningError('ADMIN_LOGIN_TAKEN'));
    expect(provider.createdInput).toBeNull();
    expect(usedRepository.createdInput).toBeNull();
  });

  it('maps provider failure without exposing its message', async () => {
    const provider = new FakeProvider();
    provider.createError = new Error('secret provider response');

    await expect(
      setup(new FakeRepository(), provider).service.provision({
        adminLogin: 'ops',
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
      }),
    ).rejects.toEqual(new AdminProvisioningError('ADMIN_PROVIDER_UNAVAILABLE'));
    expect(loggerErrorSpy).toHaveBeenCalledWith({
      errorCode: 'ADMIN_PROVIDER_UNAVAILABLE',
      operation: 'admin_provisioning',
    });
    expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain('secret provider response');
  });

  it('deletes the provider identity when transactional persistence fails', async () => {
    const repository = new FakeRepository();
    repository.createError = new Error('database detail');
    const { provider, service } = setup(repository);

    await expect(
      service.provision({ adminLogin: 'ops', firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' }),
    ).rejects.toEqual(new AdminProvisioningError('ADMIN_PROVISIONING_FAILED'));
    expect(provider.deletedProviderUserId).toBe(provider.identity.providerUserId);
  });

  it('maps a duplicate login to ADMIN_LOGIN_TAKEN after cleaning up the provider identity', async () => {
    const repository = new FakeRepository();
    repository.createError = new AdminLoginTakenError();
    const { provider, service } = setup(repository);

    await expect(
      service.provision({ adminLogin: 'ops', firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' }),
    ).rejects.toEqual(new AdminProvisioningError('ADMIN_LOGIN_TAKEN'));
    expect(provider.deletedProviderUserId).toBe(provider.identity.providerUserId);
  });

  it('requires reconciliation when provider compensation also fails', async () => {
    const repository = new FakeRepository();
    repository.createError = new Error('database detail');
    const provider = new FakeProvider();
    provider.deleteError = new Error('provider cleanup detail');

    await expect(
      setup(repository, provider).service.provision({
        adminLogin: 'ops',
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
      }),
    ).rejects.toEqual(new AdminProvisioningError('ADMIN_PROVISIONING_REQUIRES_RECONCILIATION'));
  });
});
