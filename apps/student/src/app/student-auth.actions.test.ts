import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_AUTH_ACTION_STATE } from './student-auth-action-state';

const dependencies = vi.hoisted(() => ({
  changePassword: vi.fn(),
  readToken: vi.fn(),
  redirect: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: dependencies.redirect }));
vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.test',
    studentBffSecret: 'x'.repeat(32),
  }),
}));
vi.mock('@/lib/student-auth-session', () => ({
  clearStudentSessionToken: vi.fn(),
  readStudentSessionToken: dependencies.readToken,
  setStudentSessionToken: dependencies.setToken,
}));
vi.mock('@/lib/student-auth-core', () => ({
  StudentAuthCoreClient: class {
    changePassword = dependencies.changePassword;
  },
  StudentAuthCoreError: class extends Error {
    constructor(
      public readonly code: string,
      public readonly status = 500,
    ) {
      super(code);
    }
  },
}));

import { changePasswordFromProfileAction } from './student-auth.actions';
import { StudentAuthCoreError } from '@/lib/student-auth-core';

describe('changePasswordFromProfileAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('old-session');
    dependencies.changePassword.mockResolvedValue({
      canUseStudentCapabilities: true,
      sessionState: 'active',
      sessionToken: 'new-session',
    });
  });

  it('rotates the Student session and returns to the profile with confirmation', async () => {
    const formData = new FormData();
    formData.set('currentPassword', 'TemporaryPassword1!');
    formData.set('newPassword', 'StrongerPassword2!');
    formData.set('confirmPassword', 'StrongerPassword2!');

    await changePasswordFromProfileAction(INITIAL_AUTH_ACTION_STATE, formData);

    expect(dependencies.changePassword).toHaveBeenCalledWith('old-session', {
      currentPassword: 'TemporaryPassword1!',
      newPassword: 'StrongerPassword2!',
    });
    expect(dependencies.setToken).toHaveBeenCalledWith('new-session');
    expect(dependencies.redirect).toHaveBeenCalledWith('/profile?passwordChanged=1');
  });

  it('identifies an incorrect current password without referring to the Student ID', async () => {
    dependencies.changePassword.mockRejectedValue(
      new StudentAuthCoreError('INVALID_CREDENTIALS', 401),
    );
    const formData = new FormData();
    formData.set('currentPassword', 'IncorrectPassword1!');
    formData.set('newPassword', 'StrongerPassword2!');
    formData.set('confirmPassword', 'StrongerPassword2!');

    await expect(
      changePasswordFromProfileAction(INITIAL_AUTH_ACTION_STATE, formData),
    ).resolves.toEqual({ error: 'currentPassword' });
  });
});
