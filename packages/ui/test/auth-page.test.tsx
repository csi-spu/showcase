import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthPage } from '@showcase/ui/auth-page';

afterEach(cleanup);

describe('AuthPage', () => {
  it('places the university and program brand inside the login card once', () => {
    render(
      <AuthPage
        brand={<span>มหาวิทยาลัยและสาขา</span>}
        eyebrow="ระบบนักศึกษา"
        eyebrowIcon={<span aria-hidden="true" />}
        features={[]}
        headline="จัดการผลงาน"
        headlineAccent="ในที่เดียว"
        tagline="พื้นที่สำหรับนักศึกษา"
        visual={<span aria-hidden="true" />}
      >
        <form aria-label="เข้าสู่ระบบ" />
      </AuthPage>,
    );

    const loginCard = screen.getByRole('form', { name: 'เข้าสู่ระบบ' }).closest('section');

    expect(loginCard).not.toBeNull();
    expect(within(loginCard as HTMLElement).getByText('มหาวิทยาลัยและสาขา')).toBeDefined();
    expect(screen.getAllByText('มหาวิทยาลัยและสาขา')).toHaveLength(1);
  });
});
