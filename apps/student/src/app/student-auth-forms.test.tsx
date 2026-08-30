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

  it('shows and hides the login password without clearing its value', async () => {
    const user = userEvent.setup();
    renderWithMessages(<LoginForm action={vi.fn<AuthAction>()} />);
    const password = screen.getByLabelText('รหัสผ่าน') as HTMLInputElement;

    await user.type(password, 'SecretPassword1!');
    await user.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));

    expect(password.type).toBe('text');
    expect(password.value).toBe('SecretPassword1!');
    const hidePassword = screen.getByRole('button', { name: 'ซ่อนรหัสผ่าน' });
    expect(hidePassword.getAttribute('aria-pressed')).toBe('true');
    expect(hidePassword.classList.contains('inset-y-0')).toBe(true);
    expect(hidePassword.classList.contains('w-12')).toBe(true);
    expect(hidePassword.classList.contains('z-10')).toBe(true);

    await user.click(hidePassword);
    expect(password.type).toBe('password');
  });

  it('unlocks password change only after every strength requirement and confirmation pass', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderWithMessages(<ChangePasswordForm action={action} />);

    const submit = screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' });
    expect(submit.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('รหัสผ่านปัจจุบัน'), 'temporary-password');
    await user.type(screen.getByLabelText('รหัสผ่านใหม่'), 'StrongPassword1!');

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(
      screen
        .getAllByRole('listitem')
        .every((requirement) => requirement.getAttribute('data-satisfied') === 'true'),
    ).toBe(true);
    expect(submit.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), 'StrongPassword1!');
    expect(submit.hasAttribute('disabled')).toBe(false);

    await user.click(submit);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('controls password visibility independently for every password-change field', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ChangePasswordForm action={vi.fn<AuthAction>()} />);
    const currentPassword = screen.getByLabelText('รหัสผ่านปัจจุบัน') as HTMLInputElement;
    const newPassword = screen.getByLabelText('รหัสผ่านใหม่') as HTMLInputElement;
    const confirmPassword = screen.getByLabelText('ยืนยันรหัสผ่านใหม่') as HTMLInputElement;

    expect(screen.getByRole('button', { name: 'แสดงรหัสผ่านปัจจุบัน' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'แสดงรหัสผ่านใหม่' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'แสดงยืนยันรหัสผ่านใหม่' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'แสดงรหัสผ่านใหม่' }));

    expect(newPassword.type).toBe('text');
    expect(currentPassword.type).toBe('password');
    expect(confirmPassword.type).toBe('password');
  });

  it('highlights a confirmation mismatch and prevents password-change submission', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderWithMessages(<ChangePasswordForm action={action} />);

    await user.type(screen.getByLabelText('รหัสผ่านปัจจุบัน'), 'temporary-password');
    await user.type(screen.getByLabelText('รหัสผ่านใหม่'), 'StrongPassword1!');
    await user.type(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), 'DifferentPassword2!');

    expect(screen.getByText('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน')).toBeDefined();
    expect(screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(action).not.toHaveBeenCalled();
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
