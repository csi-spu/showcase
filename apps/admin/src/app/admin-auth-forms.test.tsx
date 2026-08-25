import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { AuthAction } from './admin-auth-action-state';
import { ChangePasswordForm, LoginForm, LogoutForm } from './admin-auth-forms';

function renderWithMessages(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('Admin authentication forms', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('submits login only through the supplied Server Action', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithMessages(<LoginForm action={action} />);

    await user.type(screen.getByLabelText('ชื่อผู้ใช้'), 'operations');
    await user.type(screen.getByLabelText('รหัสผ่าน'), 'temporary-password-value');
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));

    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('adminLogin')).toBe('operations');
    expect(formData?.get('password')).toBe('temporary-password-value');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders actionable password-change validation errors', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: 'passwordMismatch' });
    const user = userEvent.setup();
    renderWithMessages(<ChangePasswordForm action={action} />);

    await user.type(screen.getByLabelText('รหัสผ่านปัจจุบัน'), 'temporary-password-value');
    await user.type(screen.getByLabelText('รหัสผ่านใหม่'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), 'different password value');
    await user.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน',
    );
  });

  it('logs out only through the supplied Server Action', async () => {
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
