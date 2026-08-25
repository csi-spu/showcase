import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminWorkspaceShell } from './admin-workspace-shell';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async (namespace: string) => (key: string) =>
      namespace === 'AccountControls' && key === 'navigation'
        ? 'จัดการสิทธิ์และบัญชี'
        : 'นำเข้าบัญชีนักศึกษา',
  ),
}));

vi.mock('./admin-auth-forms', () => ({
  LogoutForm: () => <form aria-label="ออกจากระบบ" />,
}));

vi.mock('./admin-auth.actions', () => ({ logoutAction: vi.fn() }));

describe('AdminWorkspaceShell', () => {
  afterEach(cleanup);

  it('keeps desktop navigation sticky and marks the current standalone page', async () => {
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

    const accountControlsLink = screen.getByRole('link', { name: 'จัดการสิทธิ์และบัญชี' });
    expect(accountControlsLink.getAttribute('href')).toBe('/account-controls');
    expect(accountControlsLink.getAttribute('aria-current')).toBe('page');

    const rosterLink = screen.getByRole('link', { name: 'นำเข้าบัญชีนักศึกษา' });
    expect(rosterLink.getAttribute('href')).toBe('/');
    expect(rosterLink.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});
