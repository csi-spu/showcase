import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileSecurityPanel } from './profile-security-panel';

describe('ProfileSecurityPanel', () => {
  it('links an authenticated Student to the password change page', () => {
    render(
      <ProfileSecurityPanel
        actionLabel="เปลี่ยนรหัสผ่าน"
        description="ยืนยันรหัสผ่านปัจจุบันก่อนตั้งรหัสผ่านใหม่"
        heading="ความปลอดภัยของบัญชี"
      />,
    );

    const action = screen.getByRole('link', { name: 'เปลี่ยนรหัสผ่าน' });
    const panel = action.closest('section');

    expect(action.getAttribute('href')).toBe('/profile/password');
    expect(action.classList.contains('sm:w-auto')).toBe(true);
    expect(panel?.classList.contains('sm:grid-cols-[minmax(0,1fr)_auto]')).toBe(true);
  });
});
