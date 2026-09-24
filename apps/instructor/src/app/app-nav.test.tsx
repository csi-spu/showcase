import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppNav } from './app-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

describe('AppNav', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it('keeps the compact brand visible when the sidebar is collapsed', async () => {
    const user = userEvent.setup();

    render(
      <AppNav
        account={{ isFallback: false, name: 'ผู้สอน' }}
        brand={{
          collapsed: <span>CSI compact brand</span>,
          expanded: <span>CSI expanded brand</span>,
        }}
        foot={{ collapsed: <span>ออก</span>, expanded: <span>ออกจากระบบ</span> }}
        labels={{
          account: 'บัญชีผู้ใช้',
          collapse: 'ยุบแถบนำทาง',
          expand: 'ขยายแถบนำทาง',
          sidebarLabel: 'แถบนำทางหลัก',
        }}
        sections={[
          {
            items: [{ href: '/dashboard', icon: 'layoutDashboard', label: 'ภาพรวม' }],
            label: 'ทั่วไป',
          },
        ]}
      />,
    );

    expect(screen.getByText('CSI expanded brand')).toBeDefined();
    expect(screen.queryByText('CSI compact brand')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'ยุบแถบนำทาง' }));

    expect(screen.getByText('CSI compact brand')).toBeDefined();
    expect(screen.queryByText('CSI expanded brand')).toBeNull();
    expect(screen.getByRole('button', { name: 'ขยายแถบนำทาง' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('centers the navigation groups between the brand and account controls', () => {
    render(
      <AppNav
        account={{ isFallback: false, name: 'ผู้สอน' }}
        brand={{
          collapsed: <span>CSI compact brand</span>,
          expanded: <span>CSI expanded brand</span>,
        }}
        foot={{ collapsed: <span>ออก</span>, expanded: <span>ออกจากระบบ</span> }}
        labels={{
          account: 'บัญชีผู้ใช้',
          collapse: 'ยุบแถบนำทาง',
          expand: 'ขยายแถบนำทาง',
          sidebarLabel: 'แถบนำทางหลัก',
        }}
        sections={[
          {
            items: [{ href: '/dashboard', icon: 'layoutDashboard', label: 'ภาพรวม' }],
            label: 'ทั่วไป',
          },
        ]}
      />,
    );

    const sectionList = screen.getByRole('navigation').firstElementChild;

    expect(sectionList).not.toBeNull();
    expect(sectionList?.className).toContain('my-auto');
  });
});
