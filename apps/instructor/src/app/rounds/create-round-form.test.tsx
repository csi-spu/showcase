import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateRoundPanel } from './create-round-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const messages: Record<string, string> = {
      'Groups.round.create': 'สร้างชุดงาน',
      'Groups.round.createClose': 'ยกเลิก',
      'Groups.round.createDescription': 'ตั้งชื่อให้จำง่าย',
      'Groups.round.createTitle': 'สร้างชุดงานใหม่',
      'Groups.round.name': 'ชื่อชุดงาน',
      'Groups.saving': 'กำลังบันทึก…',
    };
    return messages[`${namespace}.${key}`] ?? key;
  },
}));

describe('CreateRoundPanel', () => {
  afterEach(() => cleanup());

  it('opens the creation form in a modal over a blurred backdrop', async () => {
    const user = userEvent.setup();

    render(<CreateRoundPanel action={async () => ({ error: null })} />);

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'สร้างชุดงาน' }));

    expect(screen.getByRole('dialog', { name: 'สร้างชุดงานใหม่' })).toBeDefined();
    expect(screen.getByLabelText('ชื่อชุดงาน')).toBeDefined();
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain(
      'backdrop-blur',
    );

    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
