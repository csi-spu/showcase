import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { StudentAccountAction } from './account-controls-state';
import type { AdminStudentAccountControls } from '@/lib/admin-account-controls-core';
import { StudentRowActions } from './student-row-actions';

const { refresh, toastError, toastSuccess } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@showcase/ui/toast', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const STUDENT: AdminStudentAccountControls = {
  accessEndsAcademicYear: 2576,
  accountId: '20000000-0000-4000-8000-000000000001',
  canUseStudentCapabilities: false,
  currentAcademicYear: 2577,
  entryYear: 2569,
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  state: 'alumnus',
  status: 'active',
  version: 2,
};

const IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000002';

function renderRow(action: StudentAccountAction, student = STUDENT) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <StudentRowActions action={action} idempotencyKey={IDEMPOTENCY_KEY} student={student} />
    </NextIntlClientProvider>,
  );
}

describe('StudentRowActions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('exposes every row control as an icon button without a drawer', () => {
    renderRow(vi.fn<StudentAccountAction>());

    for (const label of [
      'แก้ไขชื่อจากทะเบียน',
      'ขยายระยะเวลาสิทธิ์',
      'รีเซ็ตรหัสผ่าน',
      'ระงับการใช้งาน',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // The manage trigger and its Sheet are gone, so nothing opens a dialog.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'จัดการ' })).toBeNull();
  });

  it('suspends an active Student with an audited reason and optimistic version', async () => {
    const action = vi.fn<StudentAccountAction>().mockResolvedValue({
      error: null,
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
      student: { ...STUDENT, status: 'suspended', version: 3 },
      temporaryPassword: null,
    });
    renderRow(action);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));
    await user.type(screen.getByLabelText('เหตุผล'), 'ระงับตามคำขอจากคณะ');
    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0]?.[1]?.entries() ?? [])).toEqual({
      action: 'suspended',
      expectedVersion: '2',
      idempotencyKey: IDEMPOTENCY_KEY,
      operation: 'setStatus',
      reason: 'ระงับตามคำขอจากคณะ',
      studentAccountId: STUDENT.accountId,
    });
    expect(toastSuccess).toHaveBeenCalledWith('ระงับการใช้งานแล้ว');
    expect(refresh).toHaveBeenCalledTimes(1);
    // The row returns to its icon actions, now offering the reverse transition.
    expect(await screen.findByRole('button', { name: 'คืนสิทธิ์การใช้งาน' })).toBeTruthy();
  });

  it('offers reactivation for a suspended Student', async () => {
    const action = vi.fn<StudentAccountAction>().mockResolvedValue({
      error: null,
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
      student: { ...STUDENT, status: 'active', version: 4 },
      temporaryPassword: null,
    });
    renderRow(action, { ...STUDENT, status: 'suspended', version: 3 });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'คืนสิทธิ์การใช้งาน' }));
    await user.type(screen.getByLabelText('เหตุผล'), 'คืนสิทธิ์หลังตรวจสอบแล้ว');
    await user.click(screen.getByRole('button', { name: 'คืนสิทธิ์การใช้งาน' }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0]?.[1]?.entries() ?? [])).toMatchObject({
      action: 'active',
      expectedVersion: '3',
      operation: 'setStatus',
    });
    expect(toastSuccess).toHaveBeenCalledWith('คืนสิทธิ์การใช้งานแล้ว');
  });

  it('keeps the control open and reports a rejected status change', async () => {
    const action = vi.fn<StudentAccountAction>().mockResolvedValue({
      error: 'stale',
      idempotencyKey: IDEMPOTENCY_KEY,
      student: STUDENT,
      temporaryPassword: null,
    });
    renderRow(action);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));
    await user.type(screen.getByLabelText('เหตุผล'), 'ระงับตามคำขอจากคณะ');
    await user.click(screen.getByRole('button', { name: 'ระงับการใช้งาน' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('เหตุผล')).toBeTruthy();
  });

  it('cancels a control without calling the action', async () => {
    const action = vi.fn<StudentAccountAction>();
    renderRow(action);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'ขยายระยะเวลาสิทธิ์' }));
    expect(screen.getByLabelText('ปีสิ้นสุดสิทธิ์ใหม่')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' })).toBeTruthy();
  });
});
