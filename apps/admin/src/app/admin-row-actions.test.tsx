import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { SetAdminStatusAction } from './accounts-state';
import { AdminRowActions } from './admin-row-actions';

const { refresh, toastError, toastSuccess } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@showcase/ui/toast', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const ADMIN = {
  accountId: '40000000-0000-4000-8000-000000000001',
  createdAt: '2026-08-25T06:00:00.000Z',
  firstNameTh: 'ผู้ดูแล',
  hasInstructorRole: false,
  lastNameTh: 'ระบบ',
  status: 'active' as const,
  version: 1,
};

const IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000002';

function renderRow(action: SetAdminStatusAction, admin = ADMIN) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <AdminRowActions action={action} admin={admin} idempotencyKey={IDEMPOTENCY_KEY} />
    </NextIntlClientProvider>,
  );
}

describe('AdminRowActions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('suspends an Admin from an inline icon action with an audited reason', async () => {
    const action = vi.fn<SetAdminStatusAction>().mockResolvedValue({
      admin: { ...ADMIN, status: 'suspended', version: 2 },
      error: null,
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
    });
    renderRow(action);
    const user = userEvent.setup();

    expect(screen.queryByRole('button', { name: 'จัดการ' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));
    await user.type(screen.getByLabelText('เหตุผล'), 'ระงับชั่วคราวตามคำขอ');
    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0]?.[1]?.entries() ?? [])).toEqual({
      accountId: ADMIN.accountId,
      action: 'suspended',
      expectedVersion: '1',
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: 'ระงับชั่วคราวตามคำขอ',
    });
    expect(toastSuccess).toHaveBeenCalledWith('ระงับการใช้งานแล้ว');
    expect(await screen.findByRole('button', { name: 'คืนสิทธิ์การใช้งาน' })).toBeTruthy();
  });

  it('keeps the reason visible when Core rejects the transition', async () => {
    const action = vi.fn<SetAdminStatusAction>().mockResolvedValue({
      admin: null,
      error: 'lastActiveAdmin',
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    renderRow(action);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));
    await user.type(screen.getByLabelText('เหตุผล'), 'ระงับชั่วคราวตามคำขอ');
    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('เหตุผล')).toBeTruthy();
  });
});
