import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type {
  InstructorAccountRow,
  InstructorPasswordResetAction,
  InstructorRoleAction,
} from './accounts-state';
import { InstructorRowActions } from './instructor-row-actions';

const { refresh, toastError, toastSuccess } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@showcase/ui/toast', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const INSTRUCTOR: InstructorAccountRow = {
  accountId: '20000000-0000-4000-8000-000000000010',
  createdAt: '2026-08-25T06:00:00.000Z',
  firstNameTh: 'อาจารย์',
  hasAdminRole: false,
  lastNameTh: 'ทดสอบ',
  status: 'active',
  version: 2,
};

const REVOKE_IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000011';
const RESET_IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000012';

function renderRow(resetAction: InstructorPasswordResetAction, instructor = INSTRUCTOR) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <InstructorRowActions
        action={vi.fn<InstructorRoleAction>()}
        idempotencyKey={REVOKE_IDEMPOTENCY_KEY}
        instructor={instructor}
        resetAction={resetAction}
        resetIdempotencyKey={RESET_IDEMPOTENCY_KEY}
      />
    </NextIntlClientProvider>,
  );
}

describe('InstructorRowActions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('resets an Instructor password with an optimistic version and shows it once', async () => {
    const resetAction = vi.fn<InstructorPasswordResetAction>().mockResolvedValue({
      error: null,
      idempotencyKey: '30000000-0000-4000-8000-000000000013',
      instructor: { ...INSTRUCTOR, version: 3 },
      temporaryPassword: 'one-time-random-instructor-password',
    });
    renderRow(resetAction);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    await user.click(screen.getByRole('button', { name: 'ยืนยันรีเซ็ตรหัสผ่าน' }));

    await waitFor(() => expect(resetAction).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(resetAction.mock.calls[0]?.[1]?.entries() ?? [])).toEqual({
      accountId: INSTRUCTOR.accountId,
      expectedVersion: '2',
      idempotencyKey: RESET_IDEMPOTENCY_KEY,
    });
    expect(toastSuccess).toHaveBeenCalledWith('รีเซ็ตรหัสผ่านแล้ว');
    expect(refresh).toHaveBeenCalledTimes(1);
    // The control stays open so the one-time password remains readable.
    expect(await screen.findByText('one-time-random-instructor-password')).toBeTruthy();
  });

  it('surfaces a Core refusal without showing a password', async () => {
    const resetAction = vi.fn<InstructorPasswordResetAction>().mockResolvedValue({
      error: 'stale',
      idempotencyKey: RESET_IDEMPOTENCY_KEY,
      instructor: INSTRUCTOR,
      temporaryPassword: null,
    });
    renderRow(resetAction);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    await user.click(screen.getByRole('button', { name: 'ยืนยันรีเซ็ตรหัสผ่าน' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not offer a password reset for an Instructor who is also an Admin', () => {
    renderRow(vi.fn<InstructorPasswordResetAction>(), { ...INSTRUCTOR, hasAdminRole: true });

    expect(screen.queryByRole('button', { name: 'รีเซ็ตรหัสผ่าน' })).toBeNull();
    expect(screen.getByRole('button', { name: 'เพิกถอนสิทธิ์ผู้สอน' })).toBeTruthy();
  });
});
