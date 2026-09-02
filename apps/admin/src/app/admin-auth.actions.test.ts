import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_AUTH_ACTION_STATE } from './admin-auth-action-state';

const dependencies = vi.hoisted(() => ({
  changePassword: vi.fn(),
  readToken: vi.fn(),
  redirect: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: dependencies.redirect }));
vi.mock('@/lib/server-environment', () => ({
  getAdminServerEnvironment: () => ({
    adminBffSecret: 'x'.repeat(32),
    coreUrl: 'https://core.test',
  }),
}));
vi.mock('@/lib/admin-auth-session', () => ({
  clearAdminSessionToken: vi.fn(),
  readAdminSessionToken: dependencies.readToken,
  setAdminSessionToken: dependencies.setToken,
}));
vi.mock('@/lib/admin-auth-core', () => ({
  AdminAuthCoreClient: class {
    changePassword = dependencies.changePassword;
  },
}));

import { changePasswordAction } from './admin-auth.actions';

describe('changePasswordAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('old-session');
    dependencies.changePassword.mockResolvedValue({ sessionToken: 'new-session' });
  });

  it('redirects with a success flag after changing the Admin password', async () => {
    const formData = new FormData();
    formData.set('currentPassword', 'TemporaryPassword1!');
    formData.set('newPassword', 'StrongerPassword2!');
    formData.set('confirmPassword', 'StrongerPassword2!');

    await changePasswordAction(INITIAL_AUTH_ACTION_STATE, formData);

    expect(dependencies.setToken).toHaveBeenCalledWith('new-session');
    expect(dependencies.redirect).toHaveBeenCalledWith('/?passwordSet=1');
  });
});
