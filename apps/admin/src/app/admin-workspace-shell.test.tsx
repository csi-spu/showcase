import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminWorkspaceShell } from './admin-workspace-shell';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => {
    if (namespace === 'Workspace') {
      const messages: Record<string, string> = {
        'navigation.closeMenu': 'ปิดเมนู',
        'navigation.collapse': 'ย่อเมนู',
        'navigation.description': 'เลือกหน้าจัดการที่ต้องการเปิด',
        'navigation.dashboard': 'ภาพรวม',
        'navigation.expand': 'ขยายเมนู',
        'navigation.label': 'เมนูผู้ดูแล',
        'navigation.openMenu': 'เปิดเมนูผู้ดูแล',
        'navigation.title': 'เมนูผู้ดูแลระบบ',
        status: 'ระบบจัดการ',
      };
      return messages[key] ?? key;
    }
    if (namespace === 'AccountControls' && key === 'navigation') return 'จัดการสิทธิ์และบัญชี';
    if (namespace === 'AccountControls' && key === 'year.navigation') return 'ปีการศึกษาปัจจุบัน';
    if (namespace === 'Notifications' && key === 'navigation') return 'การแจ้งเตือน';
    if (namespace === 'WorkManagement' && key === 'navigation') return 'จัดการผลงาน';
    return 'ทะเบียนนักศึกษา';
  }),
}));

vi.mock('./admin-auth-forms', () => ({
  LogoutForm: () => <form aria-label="ออกจากระบบ" />,
}));

vi.mock('./admin-auth.actions', () => ({ logoutAction: vi.fn() }));

describe('AdminWorkspaceShell', () => {
  afterEach(cleanup);

  it('uses the CSI identity, semantic icons, and a collapsible desktop navigation', async () => {
    const user = userEvent.setup();
    render(
      await AdminWorkspaceShell({
        activePage: 'account-controls',
        children: <h1>ควบคุมบัญชีและระยะเวลาสิทธิ์</h1>,
      }),
    );

    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toContain('lg:sticky');
    expect(sidebar.className).toContain('lg:top-0');
    expect(sidebar.className).toContain('lg:h-svh');
    expect(within(sidebar).getByText('ระบบจัดการ')).toBeTruthy();
    expect(within(sidebar).getByRole('img', { name: 'ตราสัญลักษณ์ CSI' })).toBeTruthy();
    expect(within(sidebar).queryByText('SS')).toBeNull();

    const dashboardLink = within(sidebar).getByRole('link', { name: 'ภาพรวม' });
    expect(dashboardLink.getAttribute('href')).toBe('/');
    expect(dashboardLink.querySelector('svg')).toBeTruthy();

    const accountControlsLink = screen.getByRole('link', { name: 'จัดการสิทธิ์และบัญชี' });
    expect(accountControlsLink.getAttribute('href')).toBe('/account-controls');
    expect(accountControlsLink.getAttribute('aria-current')).toBe('page');

    const rosterLink = screen.getByRole('link', { name: 'ทะเบียนนักศึกษา' });
    expect(rosterLink.getAttribute('href')).toBe('/roster');
    expect(rosterLink.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'ปีการศึกษาปัจจุบัน' }).getAttribute('href')).toBe(
      '/settings/academic-year',
    );
    const workManagementLink = screen.getByRole('link', { name: 'จัดการผลงาน' });
    expect(workManagementLink.getAttribute('href')).toBe('/works');
    expect(workManagementLink.getAttribute('aria-current')).toBeNull();
    expect(screen.queryByRole('link', { name: 'คิวตรวจผลงาน' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();

    await user.click(within(sidebar).getByRole('button', { name: 'ย่อเมนู' }));
    expect(within(sidebar).getByRole('button', { name: 'ขยายเมนู' })).toBeTruthy();
    expect(within(sidebar).getByRole('link', { name: 'ภาพรวม' })).toBeTruthy();
    expect(within(sidebar).getByRole('tooltip', { name: 'ภาพรวม' })).toBeTruthy();
    expect(within(sidebar).getByRole('form', { name: 'ออกจากระบบ' })).toBeTruthy();

    await user.hover(sidebar);
    expect(within(sidebar).getByRole('link', { name: 'ภาพรวม' }).textContent).toBe('ภาพรวม');

    const mobileTrigger = screen.getByRole('button', { name: 'เปิดเมนูผู้ดูแล' });
    expect(mobileTrigger.textContent).toBe('');

    await user.click(mobileTrigger);
    const dialog = await screen.findByRole('dialog', { name: 'เมนูผู้ดูแลระบบ' });
    expect(
      within(dialog)
        .getByRole('link', { name: 'จัดการสิทธิ์และบัญชี' })
        .getAttribute('aria-current'),
    ).toBe('page');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'เมนูผู้ดูแลระบบ' })).toBeNull();
    });
  });
});
