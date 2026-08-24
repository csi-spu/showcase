import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { AuthAction } from './student-auth-action-state';
import { ChangePasswordForm, LoginForm, LogoutForm } from './student-auth-forms';

function renderWithMessages(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('Student authentication forms', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('submits login credentials through the supplied Server Action', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderWithMessages(<LoginForm action={action} />);

    await user.type(screen.getByLabelText('รหัสนักศึกษา'), '69000001');
    await user.type(screen.getByLabelText('รหัสผ่าน'), 'initial-password');
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));

    expect(action).toHaveBeenCalledTimes(1);
    const formData = action.mock.calls[0]?.[1];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData?.get('studentId')).toBe('69000001');
    expect(formData?.get('password')).toBe('initial-password');
    expect(screen.getByRole('group', { name: 'ข้อมูลเข้าสู่ระบบ' })).not.toBeNull();
  });

  it('renders shadcn field errors returned by the password-change action', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: 'passwordMismatch' });
    const user = userEvent.setup();
    renderWithMessages(<ChangePasswordForm action={action} />);

    await user.type(screen.getByLabelText('รหัสผ่านปัจจุบัน'), 'initial-password');
    await user.type(screen.getByLabelText('รหัสผ่านใหม่'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), 'different password value');
    await user.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน',
    );
  });

  it('uses a form action for logout without client-side fetch', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithMessages(<LogoutForm action={action} />);

    await user.click(screen.getByRole('button', { name: 'ออกจากระบบ' }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
