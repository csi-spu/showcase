import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './instructor-auth-forms';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const messages: Record<string, string> = {
      'Auth.login.groupLabel': 'ข้อมูลเข้าสู่ระบบ',
      'Auth.login.hidePassword': 'ซ่อนรหัสผ่าน',
      'Auth.login.instructorLogin': 'ชื่อผู้ใช้',
      'Auth.login.instructorLoginPlaceholder': 'กรอกชื่อผู้ใช้',
      'Auth.login.password': 'รหัสผ่าน',
      'Auth.login.passwordPlaceholder': 'กรอกรหัสผ่าน',
      'Auth.login.showPassword': 'แสดงรหัสผ่าน',
      'Auth.login.submit': 'เข้าสู่ระบบ',
      'Auth.submitting': 'กรุณารอสักครู่…',
    };

    return messages[`${namespace}.${key}`] ?? key;
  },
}));

vi.mock('@showcase/ui/toast', () => ({
  toast: { error: vi.fn() },
}));

describe('LoginForm', () => {
  afterEach(() => cleanup());

  it('renders purpose-specific placeholders and toggles password visibility accessibly', async () => {
    const user = userEvent.setup();

    render(<LoginForm action={async () => ({ error: null })} />);

    expect(screen.getByLabelText('ชื่อผู้ใช้').getAttribute('placeholder')).toBe('กรอกชื่อผู้ใช้');

    const password = screen.getByLabelText('รหัสผ่าน');
    expect(password.getAttribute('placeholder')).toBe('กรอกรหัสผ่าน');
    expect(password.getAttribute('type')).toBe('password');

    await user.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));

    expect(password.getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'ซ่อนรหัสผ่าน' })).toBeDefined();
  });
});
