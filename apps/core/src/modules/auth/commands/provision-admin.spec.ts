import { AdminProvisioningError } from '../application/admin-provisioning.service';
import { runProvisionAdmin } from './provision-admin';

describe('runProvisionAdmin', () => {
  it('writes the temporary password exactly once after successful provisioning', async () => {
    const provision = jest.fn().mockResolvedValue({
      adminLogin: 'operations',
      temporaryPassword: 'random-temporary-password-value',
    });
    const stdout = jest.fn();
    const stderr = jest.fn();

    await expect(
      runProvisionAdmin(['--', 'operations', 'สมชาย', 'ใจดี'], { provision }, { stderr, stdout }),
    ).resolves.toBe(0);
    expect(provision).toHaveBeenCalledWith({
      adminLogin: 'operations',
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
    });
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(
      'Admin login: operations\nTemporary password: random-temporary-password-value\n',
    );
    expect(stderr).not.toHaveBeenCalled();
  });

  it('rejects missing or extra arguments before provisioning', async () => {
    for (const args of [[], ['ops'], ['ops', 'สมชาย'], ['ops', 'สมชาย', 'ใจดี', 'extra']]) {
      const provision = jest.fn();
      const stderr = jest.fn();
      await expect(
        runProvisionAdmin(args, { provision }, { stderr, stdout: jest.fn() }),
      ).resolves.toBe(1);
      expect(provision).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledWith(
        'Usage: pnpm --filter @showcase/core admin:provision -- <admin-login> <firstNameTh> <lastNameTh>\n',
      );
    }
  });

  it('writes only a stable error code and never a credential on failure', async () => {
    const provision = jest
      .fn()
      .mockRejectedValue(new AdminProvisioningError('ADMIN_PROVIDER_UNAVAILABLE'));
    const stdout = jest.fn();
    const stderr = jest.fn();

    await expect(
      runProvisionAdmin(['operations', 'สมชาย', 'ใจดี'], { provision }, { stderr, stdout }),
    ).resolves.toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith('Admin provisioning failed: ADMIN_PROVIDER_UNAVAILABLE\n');
  });

  it('maps unexpected failures to one stable error code', async () => {
    const stderr = jest.fn();

    await expect(
      runProvisionAdmin(
        ['operations', 'สมชาย', 'ใจดี'],
        { provision: jest.fn().mockRejectedValue(new Error('database detail')) },
        { stderr, stdout: jest.fn() },
      ),
    ).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith('Admin provisioning failed: ADMIN_PROVISIONING_FAILED\n');
  });
});
