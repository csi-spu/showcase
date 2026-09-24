import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_AUTH_ACTION_STATE } from './instructor-auth-action-state';

const dependencies = vi.hoisted(() => ({
  login: vi.fn(),
  redirect: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock('next/navigation', () => ({ redirect: dependencies.redirect }));
vi.mock('@/lib/server-environment', () => ({
  getInstructorServerEnvironment: () => ({
    coreUrl: 'https://core.test',
    instructorBffSecret: 'x'.repeat(32),
  }),
}));
vi.mock('@/lib/instructor-auth-session', () => ({
  clearInstructorSessionToken: vi.fn(),
  readInstructorSessionToken: vi.fn(),
  setInstructorSessionToken: dependencies.setToken,
}));
vi.mock('@/lib/instructor-auth-core', () => ({
  InstructorAuthCoreClient: class {
    login = dependencies.login;
  },
  InstructorAuthCoreError: class extends Error {
    constructor(
      public readonly code: string,
      public readonly status = 500,
    ) {
      super(code);
    }
  },
}));

import { loginAction } from './instructor-auth.actions';

describe('loginAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.login.mockResolvedValue({
      sessionState: 'active',
      sessionToken: 'new-session',
    });
  });

  it('redirects the Instructor to the dashboard after login', async () => {
    const formData = new FormData();
    formData.set('instructorLogin', 'instructor');
    formData.set('password', 'StrongerPassword2!');

    await loginAction(INITIAL_AUTH_ACTION_STATE, formData);

    expect(dependencies.setToken).toHaveBeenCalledWith('new-session');
    expect(dependencies.redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps a required password change on the authentication page', async () => {
    dependencies.login.mockResolvedValue({
      sessionState: 'password_change_required',
      sessionToken: 'password-change-session',
    });
    const formData = new FormData();
    formData.set('instructorLogin', 'instructor');
    formData.set('password', 'TemporaryPassword1!');

    await loginAction(INITIAL_AUTH_ACTION_STATE, formData);

    expect(dependencies.setToken).toHaveBeenCalledWith('password-change-session');
    expect(dependencies.redirect).toHaveBeenCalledWith('/');
  });
});
