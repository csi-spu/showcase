import { CoreClientError } from '@showcase/core-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_AUTH_ACTION_STATE } from './student-collection-auth-action-state';

const dependencies = vi.hoisted(() => ({
  changePassword: vi.fn(),
  clearToken: vi.fn(),
  readToken: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
  setToken: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: dependencies.redirect }));
vi.mock('@/lib/server-environment', () => ({
  getStudentCollectionServerEnvironment: () => ({
    coreUrl: 'https://core.test',
    studentCollectionBffSecret: 'x'.repeat(32),
  }),
}));
vi.mock('@/lib/student-collection-auth-session', () => ({
  clearStudentCollectionSessionToken: dependencies.clearToken,
  readStudentCollectionSessionToken: dependencies.readToken,
  setStudentCollectionSessionToken: dependencies.setToken,
}));
vi.mock('@/lib/student-collection-auth-core', () => ({
  StudentCollectionAuthCoreClient: class {
    changePassword = dependencies.changePassword;
  },
}));

import { changePasswordAction, clearExpiredSessionAction } from './student-collection-auth.actions';

function passwordChange(overrides: Partial<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  formData.set('currentPassword', 'TemporaryPassword1!');
  formData.set('newPassword', 'StrongerPassword2!');
  formData.set('confirmPassword', 'StrongerPassword2!');
  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined) formData.set(name, value);
  }
  return formData;
}

describe('changePasswordAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('old-session');
    dependencies.changePassword.mockResolvedValue({
      sessionState: 'active',
      sessionToken: 'new-session',
    });
  });

  it('sends a deeplinked Student on to the form with a one-shot success flag', async () => {
    await expect(
      changePasswordAction('/forms/form-1', INITIAL_AUTH_ACTION_STATE, passwordChange()),
    ).rejects.toThrow('redirect:');

    expect(dependencies.setToken).toHaveBeenCalledWith('new-session');
    expect(dependencies.redirect).toHaveBeenCalledWith('/forms/form-1?passwordSet=1');
  });

  it('lands on the dashboard when no deeplink brought the Student here', async () => {
    await expect(
      changePasswordAction(null, INITIAL_AUTH_ACTION_STATE, passwordChange()),
    ).rejects.toThrow('redirect:');

    expect(dependencies.redirect).toHaveBeenCalledWith('/?passwordSet=1');
  });

  it.each(['https://evil.example.com/forms/form-1', '//evil.example.com', 'forms/form-1'])(
    'never redirects off-app for the return path %s',
    async (returnTo) => {
      await expect(
        changePasswordAction(returnTo, INITIAL_AUTH_ACTION_STATE, passwordChange()),
      ).rejects.toThrow('redirect:');

      expect(dependencies.redirect).toHaveBeenCalledWith('/?passwordSet=1');
    },
  );

  it('keeps the Student on the step when the new passwords do not match', async () => {
    const state = await changePasswordAction(
      '/forms/form-1',
      INITIAL_AUTH_ACTION_STATE,
      passwordChange({ confirmPassword: 'DifferentPassword3!' }),
    );

    expect(state).toEqual({ error: 'passwordMismatch' });
    expect(dependencies.changePassword).not.toHaveBeenCalled();
    expect(dependencies.redirect).not.toHaveBeenCalled();
  });

  it('keeps the Student on the step when Core rejects the password', async () => {
    dependencies.changePassword.mockRejectedValue(new CoreClientError('INVALID_PASSWORD', 400));

    const state = await changePasswordAction(
      '/forms/form-1',
      INITIAL_AUTH_ACTION_STATE,
      passwordChange(),
    );

    expect(state).toEqual({ error: 'passwordPolicy' });
    expect(dependencies.redirect).not.toHaveBeenCalled();
  });

  it('keeps the return path when the session expires during the change', async () => {
    dependencies.changePassword.mockRejectedValue(new CoreClientError('SESSION_EXPIRED', 401));

    await expect(
      changePasswordAction('/forms/form-1', INITIAL_AUTH_ACTION_STATE, passwordChange()),
    ).rejects.toThrow('redirect:');

    expect(dependencies.clearToken).toHaveBeenCalled();
    expect(dependencies.redirect).toHaveBeenCalledWith('/?expired=1&returnTo=%2Fforms%2Fform-1');
  });

  it('keeps the return path when the session cookie is already gone', async () => {
    dependencies.readToken.mockResolvedValue(null);

    await expect(
      changePasswordAction('/history/form-1', INITIAL_AUTH_ACTION_STATE, passwordChange()),
    ).rejects.toThrow('redirect:');

    expect(dependencies.changePassword).not.toHaveBeenCalled();
    expect(dependencies.redirect).toHaveBeenCalledWith('/?expired=1&returnTo=%2Fhistory%2Fform-1');
  });

  it('drops an off-app return path from the expired redirect', async () => {
    dependencies.changePassword.mockRejectedValue(new CoreClientError('SESSION_EXPIRED', 401));

    await expect(
      changePasswordAction('//evil.example.com', INITIAL_AUTH_ACTION_STATE, passwordChange()),
    ).rejects.toThrow('redirect:');

    expect(dependencies.redirect).toHaveBeenCalledWith('/?expired=1');
  });
});

describe('clearExpiredSessionAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns to sign-in still carrying the deeplink', async () => {
    await expect(clearExpiredSessionAction('/forms/form-1')).rejects.toThrow('redirect:');

    expect(dependencies.clearToken).toHaveBeenCalled();
    expect(dependencies.redirect).toHaveBeenCalledWith('/?returnTo=%2Fforms%2Fform-1');
  });

  it.each([null, 'https://evil.example.com'])(
    'returns to plain sign-in without a valid return path (%s)',
    async (returnTo) => {
      await expect(clearExpiredSessionAction(returnTo)).rejects.toThrow('redirect:');

      expect(dependencies.redirect).toHaveBeenCalledWith('/');
    },
  );
});
