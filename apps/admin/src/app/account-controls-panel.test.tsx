import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { AcademicYearAction, StudentAccountAction } from './account-controls-state';
import { AccountControlsPanel } from './account-controls-panel';

const STUDENT = {
  accessEndsAcademicYear: 2576,
  accountId: '20000000-0000-4000-8000-000000000001',
  canUseStudentCapabilities: false,
  currentAcademicYear: 2577,
  entryYear: 2569,
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  state: 'alumnus' as const,
  version: 2,
};

function renderPanel(academicYearAction: AcademicYearAction, studentAction: StudentAccountAction) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <AccountControlsPanel
        academicYear={{
          currentAcademicYear: 2577,
          updatedAt: '2026-08-25T06:00:00.000Z',
          version: 4,
        }}
        academicYearAction={academicYearAction}
        academicYearIdempotencyKey="30000000-0000-4000-8000-000000000001"
        studentAction={studentAction}
        studentIdempotencyKey="30000000-0000-4000-8000-000000000002"
      />
    </NextIntlClientProvider>,
  );
}

describe('Admin Account controls panel', () => {
  afterEach(cleanup);

  it('renders Current Academic Year as an explicit audited control', async () => {
    const academicYearAction = vi.fn<AcademicYearAction>().mockResolvedValue({
      error: null,
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
      settings: {
        currentAcademicYear: 2578,
        updatedAt: '2026-08-25T06:00:00.000Z',
        version: 5,
      },
    });
    renderPanel(academicYearAction, vi.fn<StudentAccountAction>());

    expect(screen.getByText('ปีการศึกษาปัจจุบัน')).toBeTruthy();
    expect(screen.getByText('2577')).toBeTruthy();
    expect(screen.getByText(/อัปเดตล่าสุด.*13:00/)).toBeTruthy();
    await userEvent.setup().clear(screen.getByLabelText('ปีการศึกษาใหม่'));
    await userEvent.setup().type(screen.getByLabelText('ปีการศึกษาใหม่'), '2578');
    await userEvent.setup().click(screen.getByRole('button', { name: 'บันทึกปีการศึกษา' }));
    await waitFor(() => expect(academicYearAction).toHaveBeenCalledTimes(1));
    expect(
      Object.fromEntries(academicYearAction.mock.calls[0]?.[1]?.entries() ?? []),
    ).toMatchObject({
      currentAcademicYear: '2578',
      expectedVersion: '4',
      idempotencyKey: '30000000-0000-4000-8000-000000000001',
    });
  });

  it('moves keyboard focus to a failed action message', async () => {
    const studentAction = vi.fn<StudentAccountAction>().mockResolvedValue({
      error: 'notFound',
      idempotencyKey: '30000000-0000-4000-8000-000000000002',
      student: null,
      temporaryPassword: null,
    });
    renderPanel(vi.fn<AcademicYearAction>(), studentAction);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('รหัสนักศึกษา'), '69000001');
    await user.click(screen.getByRole('button', { name: 'ค้นหาบัญชี' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it('keeps Student ID in the lookup form and renders safe individual controls', async () => {
    const studentAction = vi.fn<StudentAccountAction>().mockResolvedValue({
      error: null,
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
      student: STUDENT,
      temporaryPassword: null,
    });
    renderPanel(vi.fn<AcademicYearAction>(), studentAction);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('รหัสนักศึกษา'), '69000001');
    await user.click(screen.getByRole('button', { name: 'ค้นหาบัญชี' }));
    await waitFor(() => expect(studentAction).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(studentAction.mock.calls[0]?.[1]?.entries() ?? [])).toEqual({
      operation: 'lookup',
      studentId: '69000001',
    });
    expect(await screen.findByText('สมชาย ใจดี')).toBeTruthy();
    expect(screen.getByText('ศิษย์เก่า')).toBeTruthy();
    expect(screen.queryByLabelText('ชื่อจริง')).toBeNull();
    expect(screen.queryByLabelText('ปีสิ้นสุดสิทธิ์ใหม่')).toBeNull();
    expect(screen.getByRole('button', { name: 'แก้ไขชื่อจากทะเบียน' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ขยายระยะเวลาสิทธิ์' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' })).toBeTruthy();
  });

  it('shows a successful temporary password once as durable copyable text', async () => {
    const studentAction = vi
      .fn<StudentAccountAction>()
      .mockResolvedValueOnce({
        error: null,
        idempotencyKey: '30000000-0000-4000-8000-000000000003',
        student: STUDENT,
        temporaryPassword: null,
      })
      .mockResolvedValueOnce({
        error: null,
        idempotencyKey: '30000000-0000-4000-8000-000000000004',
        student: { ...STUDENT, version: 3 },
        temporaryPassword: 'one-time-random-password',
      });
    renderPanel(vi.fn<AcademicYearAction>(), studentAction);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('รหัสนักศึกษา'), '69000001');
    await user.click(screen.getByRole('button', { name: 'ค้นหาบัญชี' }));
    await user.click(await screen.findByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    await user.click(screen.getByRole('button', { name: 'ยืนยันรีเซ็ตรหัสผ่าน' }));

    expect(await screen.findByText('one-time-random-password')).toBeTruthy();
    expect(screen.getByText('รหัสผ่านชั่วคราวจะแสดงครั้งนี้ครั้งเดียว')).toBeTruthy();
  });

  it('submits an explicit audited Roster Name correction', async () => {
    const studentAction = vi
      .fn<StudentAccountAction>()
      .mockResolvedValueOnce({
        error: null,
        idempotencyKey: '30000000-0000-4000-8000-000000000003',
        student: STUDENT,
        temporaryPassword: null,
      })
      .mockResolvedValueOnce({
        error: null,
        idempotencyKey: '30000000-0000-4000-8000-000000000004',
        student: { ...STUDENT, firstNameTh: 'สมหญิง', lastNameTh: 'มั่นใจ', version: 3 },
        temporaryPassword: null,
      });
    renderPanel(vi.fn<AcademicYearAction>(), studentAction);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('รหัสนักศึกษา'), '69000001');
    await user.click(screen.getByRole('button', { name: 'ค้นหาบัญชี' }));
    await user.click(await screen.findByRole('button', { name: 'แก้ไขชื่อจากทะเบียน' }));
    await user.clear(await screen.findByLabelText('ชื่อจริง'));
    await user.type(screen.getByLabelText('ชื่อจริง'), 'สมหญิง');
    await user.clear(screen.getByLabelText('นามสกุล'));
    await user.type(screen.getByLabelText('นามสกุล'), 'มั่นใจ');
    await user.type(screen.getByLabelText('เหตุผลการแก้ไขชื่อ'), 'แก้ไขตามหลักฐานทะเบียน');
    await user.click(screen.getByRole('button', { name: 'บันทึกการแก้ไขชื่อ' }));

    await waitFor(() => expect(studentAction).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('สมหญิง มั่นใจ')).toBeTruthy();
    expect(Object.fromEntries(studentAction.mock.calls[1]?.[1]?.entries() ?? [])).toMatchObject({
      expectedVersion: '2',
      firstNameTh: 'สมหญิง',
      lastNameTh: 'มั่นใจ',
      operation: 'correctName',
      reason: 'แก้ไขตามหลักฐานทะเบียน',
      studentAccountId: STUDENT.accountId,
    });
  });
});
