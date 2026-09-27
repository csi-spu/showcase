import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';

const dependencies = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: dependencies.push }) }));

import { UnentitledFormDialog } from './unentitled-form-dialog';

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <UnentitledFormDialog />
    </NextIntlClientProvider>,
  );
}

describe('UnentitledFormDialog', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('explains the missing form neutrally and offers the way home', async () => {
    renderDialog();

    const dialog = await screen.findByRole('dialog', {
      name: 'ไม่พบแบบฟอร์มนี้ในรายการของคุณ',
    });
    expect(dialog.textContent).toContain(
      'คุณอาจยังไม่ได้อยู่ในกลุ่มที่ได้รับแบบฟอร์มนี้ หรือลิงก์อาจไม่ถูกต้อง โปรดติดต่อผู้สอนหรือผู้ดูแลระบบ',
    );
    expect(screen.getByRole('link', { name: 'กลับหน้าหลัก' }).getAttribute('href')).toBe('/');
  });

  it('keeps focus inside the dialog on the way home', async () => {
    const user = userEvent.setup();
    renderDialog();

    const action = await screen.findByRole('link', { name: 'กลับหน้าหลัก' });
    await vi.waitFor(() => expect(document.activeElement).toBe(action));
    await user.tab();
    await vi.waitFor(() => expect(document.activeElement).toBe(action));
  });

  it('goes home on Escape', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(dependencies.push).toHaveBeenCalledWith('/');
  });
});
