import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import { ChangeRequestForm, type ChangeRequestAction } from './change-request-form';

describe('Admin Change Request form', () => {
  afterEach(cleanup);

  it('submits one reason, actionable feedback, expected version, and idempotency key', async () => {
    const action = vi.fn<ChangeRequestAction>().mockResolvedValue({
      error: null,
      idempotencyKey: '78000000-0000-4000-8000-000000000002',
      isComplete: true,
    });
    renderForm(action);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('เหตุผลที่ขอให้แก้ไข'), 'links_tags');
    await user.type(
      screen.getByLabelText('คำแนะนำที่นำไปแก้ไขได้'),
      'กรุณาตรวจสอบลิงก์และอธิบายแท็กให้สัมพันธ์กับผลงาน',
    );
    await user.click(screen.getByRole('button', { name: 'ส่งคำขอแก้ไข' }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0]?.[1]?.entries() ?? [])).toEqual({
      expectedRevisionVersion: '3',
      feedback: 'กรุณาตรวจสอบลิงก์และอธิบายแท็กให้สัมพันธ์กับผลงาน',
      idempotencyKey: '78000000-0000-4000-8000-000000000001',
      reason: 'links_tags',
    });
    expect(await screen.findByText('ส่งคำขอแก้ไขแล้ว')).toBeTruthy();
  });

  it('moves focus to a stale conflict and preserves feedback for retry', async () => {
    const action = vi.fn<ChangeRequestAction>().mockResolvedValue({
      error: 'stale',
      idempotencyKey: '78000000-0000-4000-8000-000000000001',
      isComplete: false,
    });
    renderForm(action);
    const user = userEvent.setup();
    const feedback = screen.getByLabelText('คำแนะนำที่นำไปแก้ไขได้');
    await user.type(feedback, 'กรุณาแก้ไขรายละเอียดตามข้อกำหนดของสาขา');
    await user.click(screen.getByRole('button', { name: 'ส่งคำขอแก้ไข' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect((feedback as HTMLTextAreaElement).value).toBe('กรุณาแก้ไขรายละเอียดตามข้อกำหนดของสาขา');
  });
});

function renderForm(action: ChangeRequestAction) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <ChangeRequestForm
        action={action}
        expectedRevisionVersion={3}
        idempotencyKey="78000000-0000-4000-8000-000000000001"
      />
    </NextIntlClientProvider>,
  );
}
