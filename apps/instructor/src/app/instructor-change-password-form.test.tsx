import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { AuthAction } from './instructor-auth-action-state';
import { ChangePasswordForm } from './instructor-auth-forms';

function renderWithMessages(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('ChangePasswordForm', () => {
  afterEach(() => cleanup());

  it('updates the checklist while typing and blocks submission until the password is valid', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderWithMessages(<ChangePasswordForm action={action} />);
    const submit = screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' });
    const newPassword = screen.getByLabelText('รหัสผ่านใหม่');
    const confirmPassword = screen.getByLabelText('ยืนยันรหัสผ่านใหม่');
    const requirementStates = () =>
      screen.getAllByRole('listitem').map((requirement) => requirement.dataset.satisfied);
    expect(submit.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('รหัสผ่านปัจจุบัน'), 'temporary-password-value');
    await user.type(newPassword, 'correct horse battery staple');
    await user.type(confirmPassword, 'correct horse battery staple');

    expect(requirementStates()).toEqual(['true', 'true', 'false', 'false', 'false']);
    expect(submit.hasAttribute('disabled')).toBe(true);

    await user.clear(newPassword);
    await user.type(newPassword, 'Correct horse battery 1!');

    expect(requirementStates()).toEqual(['true', 'true', 'true', 'true', 'true']);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('แข็งแรง');
    expect(screen.getByText('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน')).toBeDefined();
    expect(submit.hasAttribute('disabled')).toBe(true);

    await user.clear(confirmPassword);
    await user.type(confirmPassword, 'Correct horse battery 1!');

    expect(screen.getByText('รหัสผ่านตรงกัน')).toBeDefined();
    expect(submit.hasAttribute('disabled')).toBe(false);

    await user.click(submit);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('keeps the typed passwords after Core rejects the change', async () => {
    const action = vi.fn<AuthAction>().mockResolvedValue({ error: 'passwordComposition' });
    const user = userEvent.setup();
    renderWithMessages(<ChangePasswordForm action={action} />);
    const newPassword = screen.getByLabelText('รหัสผ่านใหม่') as HTMLInputElement;

    await user.type(screen.getByLabelText('รหัสผ่านปัจจุบัน'), 'temporary-password-value');
    await user.type(newPassword, 'Correct horse battery 1!');
    await user.type(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), 'Correct horse battery 1!');
    await user.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'รหัสผ่านต้องมีตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ ตัวเลข และอักขระพิเศษอย่างน้อยอย่างละหนึ่งตัว',
    );
    expect(newPassword.value).toBe('Correct horse battery 1!');
  });
});
