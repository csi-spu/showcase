import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import { INITIAL_AUTH_ACTION_STATE } from './student-collection-auth-action-state';

const dependencies = vi.hoisted(() => ({
  changePasswordAction: vi.fn(),
  clearExpiredSessionAction: vi.fn(),
  getAuthState: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock('@/lib/student-collection-auth-page-state', () => ({
  getStudentCollectionAuthPageState: dependencies.getAuthState,
}));
vi.mock('@/lib/student-collection-auth-session', () => ({
  readStudentCollectionSessionToken: vi.fn(),
}));
vi.mock('@/lib/student-collection-forms-core', () => ({
  StudentCollectionFormsCoreClient: class {},
}));
vi.mock('./collection-forms.actions', () => ({ markNotificationsReadAction: vi.fn() }));
vi.mock('./student-collection-auth.actions', () => ({
  changePasswordAction: dependencies.changePasswordAction,
  clearExpiredSessionAction: dependencies.clearExpiredSessionAction,
  loginAction: vi.fn(),
  logoutAction: vi.fn(),
}));

import Home from './page';

async function renderHome(searchParams: { expired?: string; returnTo?: string }) {
  render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {await Home({ searchParams: Promise.resolve(searchParams) })}
    </NextIntlClientProvider>,
  );
}

describe('Student collection sign-in page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.changePasswordAction.mockResolvedValue(INITIAL_AUTH_ACTION_STATE);
  });
  afterEach(() => cleanup());

  it('submits the first-login password change with the deeplink return path', async () => {
    const user = userEvent.setup();
    dependencies.getAuthState.mockResolvedValue({ kind: 'password_change_required' });
    await renderHome({ returnTo: '/forms/form-1' });

    await user.type(await screen.findByLabelText('รหัสผ่านปัจจุบัน'), 'TemporaryPassword1!');
    await user.type(screen.getByLabelText('รหัสผ่านใหม่'), 'StrongerPassword2!');
    await user.type(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), 'StrongerPassword2!');
    await user.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' }));

    await vi.waitFor(() =>
      expect(dependencies.changePasswordAction).toHaveBeenCalledWith(
        '/forms/form-1',
        INITIAL_AUTH_ACTION_STATE,
        expect.any(FormData),
      ),
    );
  });

  it('never binds an off-app return path to the password change', async () => {
    const user = userEvent.setup();
    dependencies.getAuthState.mockResolvedValue({ kind: 'password_change_required' });
    await renderHome({ returnTo: 'https://evil.example.com' });

    await user.type(await screen.findByLabelText('รหัสผ่านปัจจุบัน'), 'TemporaryPassword1!');
    await user.type(screen.getByLabelText('รหัสผ่านใหม่'), 'StrongerPassword2!');
    await user.type(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), 'StrongerPassword2!');
    await user.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' }));

    await vi.waitFor(() =>
      expect(dependencies.changePasswordAction).toHaveBeenCalledWith(
        null,
        INITIAL_AUTH_ACTION_STATE,
        expect.any(FormData),
      ),
    );
  });

  it('signs in again after expiry still carrying the deeplink', async () => {
    const user = userEvent.setup();
    dependencies.getAuthState.mockResolvedValue({ kind: 'expired' });
    await renderHome({ expired: '1', returnTo: '/forms/form-1' });

    await user.click(await screen.findByRole('button', { name: 'expired.action' }));

    await vi.waitFor(() =>
      expect(dependencies.clearExpiredSessionAction).toHaveBeenCalledWith(
        '/forms/form-1',
        expect.any(FormData),
      ),
    );
  });
});
