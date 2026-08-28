import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentWorkspaceShell } from './student-workspace-shell';

const viewport = vi.hoisted(() => ({ isMobile: false }));
const sidebarProfile = vi.hoisted(() => ({
  getProfile: vi.fn(),
  readToken: vi.fn(async () => 'session-token'),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.isMobile }));
vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.example.test',
    studentBffSecret: 'student-bff-secret-with-at-least-32-characters',
    visitorUrl: 'https://visitor.example.test',
  }),
}));
vi.mock('@/lib/student-auth-session', () => ({
  readStudentSessionToken: sidebarProfile.readToken,
}));
vi.mock('@/lib/student-profile-core', () => ({
  StudentProfileCoreError: class StudentProfileCoreError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  StudentProfileCoreClient: class {
    getProfile = sidebarProfile.getProfile;
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
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
      'navigation.work': 'จัดการผลงาน',
      'profile.entryYear': 'ปีที่เข้าศึกษา {year}',
      'profile.fallback': 'ยังไม่ได้ตั้งค่าโปรไฟล์',
      'profile.photoAlt': 'รูปโปรไฟล์ของ {name}',
      'status.active': 'พร้อมสร้างและส่งผลงาน',
      'status.readOnly': 'อ่านข้อมูลได้เท่านั้น',
      workspace: 'พื้นที่นักศึกษา',
    };
    return Object.entries(values ?? {}).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      messages[key] ?? key,
    );
  }),
}));

vi.mock('./student-auth-forms', () => ({
  LogoutForm: () => <form aria-label="ออกจากระบบ" />,
}));

vi.mock('./student-auth.actions', () => ({ logoutAction: vi.fn() }));

describe('StudentWorkspaceShell', () => {
  afterEach(() => {
    cleanup();
    viewport.isMobile = false;
    sidebarProfile.getProfile.mockReset();
    sidebarProfile.readToken.mockClear();
  });

  it('uses the animated sidebar and marks the current desktop page', async () => {
    render(
      await StudentWorkspaceShell({
        activePage: 'profile',
        canCreateWork: false,
        children: <h1>โปรไฟล์สาธารณะ</h1>,
        profile: {
          displayName: 'ณัฐดนัย สุขใจ',
          entryYear: 2569,
          photo: { height: 512, url: 'https://media.example.test/private.webp', width: 512 },
        },
      }),
    );

    const sidebar = screen.getByRole('complementary');
    const navigation = within(sidebar).getByRole('navigation', { name: 'เมนูนักศึกษา' });
    expect(within(navigation).queryByRole('link', { name: 'โปรไฟล์สาธารณะ' })).toBeNull();
    expect(
      within(sidebar)
        .getByRole('link', { name: /ณัฐดนัย สุขใจ/ })
        .getAttribute('href'),
    ).toBe('/profile');
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(within(sidebar).getByText('อ่านข้อมูลได้เท่านั้น')).toBeTruthy();
    expect(within(sidebar).getByText('ณัฐดนัย สุขใจ')).toBeTruthy();
    expect(within(sidebar).getByText('ปีที่เข้าศึกษา 2569')).toBeTruthy();
    expect(
      within(sidebar).getByRole('img', { name: 'รูปโปรไฟล์ของ ณัฐดนัย สุขใจ' }).getAttribute('src'),
    ).toBe('/profile/photo');
    expect(sidebar.innerHTML).not.toContain('private.webp');
    expect(screen.getByRole('button', { name: 'เปิดเมนู' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'สร้างผลงาน' })).toBeNull();
    expect(within(navigation).getByRole('link', { name: 'จัดการผลงาน' }).getAttribute('href')).toBe(
      '/works',
    );
    const workspaceHeader = screen.getByRole('banner');
    expect(workspaceHeader.classList.contains('z-30')).toBe(true);
    expect(workspaceHeader.classList.contains('bg-background')).toBe(true);
    expect(workspaceHeader.classList.contains('bg-background/90')).toBe(false);
  });

  it('opens and closes the animated mobile sidebar', async () => {
    viewport.isMobile = true;
    const user = userEvent.setup();
    render(
      await StudentWorkspaceShell({
        activePage: 'profile',
        canCreateWork: false,
        children: <h1>โปรไฟล์สาธารณะ</h1>,
        profile: null,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'เปิดเมนู' }));

    const dialog = await screen.findByRole('dialog', { name: 'เมนู' });
    const navigation = within(dialog).getByRole('navigation', { name: 'เมนูนักศึกษา' });
    expect(within(navigation).queryByRole('link', { name: 'โปรไฟล์สาธารณะ' })).toBeNull();
    expect(
      within(dialog)
        .getByRole('link', { name: /ยังไม่ได้ตั้งค่าโปรไฟล์/ })
        .getAttribute('href'),
    ).toBe('/profile');
    expect(within(dialog).queryByRole('link', { name: 'สร้างผลงาน' })).toBeNull();
    expect(within(navigation).getByRole('link', { name: 'จัดการผลงาน' }).getAttribute('href')).toBe(
      '/works',
    );

    await user.click(within(dialog).getByRole('link', { name: 'ภาพรวม' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'เมนู' })).toBeNull();
    });
  });

  it('loads the private profile summary when the page has not already loaded it', async () => {
    sidebarProfile.getProfile.mockResolvedValue({
      canEditProfile: true,
      profile: {
        displayName: 'ชลธิชา',
        entryYear: 2568,
        photo: null,
      },
    });

    render(
      await StudentWorkspaceShell({
        activePage: 'home',
        canCreateWork: true,
        children: <h1>ภาพรวม</h1>,
      }),
    );

    expect(sidebarProfile.getProfile).toHaveBeenCalledWith('session-token');
    expect(screen.getByText('ชลธิชา')).toBeTruthy();
    expect(screen.getByText('ปีที่เข้าศึกษา 2568')).toBeTruthy();
  });

  it('keeps the workspace available when the optional profile summary is unavailable', async () => {
    const { StudentProfileCoreError } = await import('@/lib/student-profile-core');
    sidebarProfile.getProfile.mockRejectedValue(
      new StudentProfileCoreError('AUTH_SERVICE_UNAVAILABLE', 503),
    );

    render(
      await StudentWorkspaceShell({
        activePage: 'home',
        canCreateWork: true,
        children: <h1>ภาพรวม</h1>,
      }),
    );

    expect(screen.getByRole('heading', { name: 'ภาพรวม' })).toBeTruthy();
    expect(screen.getByText('ยังไม่ได้ตั้งค่าโปรไฟล์')).toBeTruthy();
  });
});
