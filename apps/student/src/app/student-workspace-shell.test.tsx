import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentWorkspaceShell } from './student-workspace-shell';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    const messages: Record<string, string> = {
      'navigation.createWork': 'สร้างผลงาน',
      'navigation.home': 'ภาพรวม',
      'navigation.invitations': 'คำเชิญผู้ร่วมผลงาน',
      'navigation.label': 'เมนูนักศึกษา',
      'navigation.menuDescription': 'เลือกหน้าที่ต้องการเปิด',
      'navigation.menuTitle': 'เมนูระบบนักศึกษา',
      'navigation.notifications': 'การแจ้งเตือน',
      'navigation.openMenu': 'เปิดเมนู',
      'navigation.profile': 'โปรไฟล์สาธารณะ',
      'status.active': 'พร้อมสร้างและส่งผลงาน',
      'status.readOnly': 'อ่านข้อมูลได้เท่านั้น',
      workspace: 'พื้นที่นักศึกษา',
    };
    return messages[key] ?? key;
  }),
}));

vi.mock('./student-auth-forms', () => ({
  LogoutForm: () => <form aria-label="ออกจากระบบ" />,
}));

vi.mock('./student-auth.actions', () => ({ logoutAction: vi.fn() }));

describe('StudentWorkspaceShell', () => {
  afterEach(cleanup);

  it('provides responsive navigation and marks the current page', async () => {
    const user = userEvent.setup();
    render(
      await StudentWorkspaceShell({
        activePage: 'profile',
        canCreateWork: false,
        children: <h1>โปรไฟล์สาธารณะ</h1>,
      }),
    );

    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toContain('lg:sticky');
    expect(sidebar.className).toContain('lg:h-svh');
    expect(
      within(sidebar).getByRole('link', { name: 'โปรไฟล์สาธารณะ' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(within(sidebar).getByText('อ่านข้อมูลได้เท่านั้น')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'เปิดเมนู' }));

    const dialog = await screen.findByRole('dialog', { name: 'เมนูระบบนักศึกษา' });
    expect(
      within(dialog).getByRole('link', { name: 'โปรไฟล์สาธารณะ' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.queryByRole('link', { name: 'ผลงานของฉัน' })).toBeNull();
    expect(within(dialog).queryByRole('link', { name: 'สร้างผลงาน' })).toBeNull();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'เมนูระบบนักศึกษา' })).toBeNull();
    });
  });
});
