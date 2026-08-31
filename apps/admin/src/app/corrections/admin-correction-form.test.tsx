import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import type { AdminCorrectionBase } from '@/lib/admin-reviews-core';
import { AdminCorrectionForm, type AdminCorrectionAction } from './admin-correction-form';

describe('Admin correction form', () => {
  afterEach(cleanup);

  it('keeps save separate from publication and sends complete candidate content with a reason', async () => {
    const action = vi.fn<AdminCorrectionAction>().mockResolvedValue({
      error: null,
      idempotencyKey: id(3),
      revisionPublicId: id(4),
    });
    renderForm(action);
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText('สรุป'), {
      target: { value: 'สรุปที่แก้ไขโดยผู้ดูแล' },
    });
    fireEvent.change(screen.getByLabelText('เหตุผลการแก้ไข'), {
      target: { value: 'แก้ไขข้อความที่คลาดเคลื่อนจากผลงานจริง' },
    });
    expect(
      within(screen.getByRole('status', { name: 'รายการที่เปลี่ยน' })).getByText('สรุป'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'บันทึกเป็นฉบับรอตรวจ' }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0]?.[1]?.entries() ?? [])).toMatchObject({
      expectedPublishedRevisionId: id(1),
      expectedRevisionVersion: '2',
      idempotencyKey: id(3),
      reason: 'แก้ไขข้อความที่คลาดเคลื่อนจากผลงานจริง',
      summary: 'สรุปที่แก้ไขโดยผู้ดูแล',
    });
    expect(screen.queryByRole('button', { name: 'อนุมัติและเผยแพร่' })).toBeNull();
    expect(await screen.findByText('สร้างฉบับรอตรวจแล้ว')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'เปิดฉบับใหม่เพื่อตรวจและเผยแพร่' })).toBeTruthy();
  });

  it('focuses the error summary and preserves edited content after a stale conflict', async () => {
    const action = vi.fn<AdminCorrectionAction>().mockResolvedValue({
      error: 'stale',
      idempotencyKey: id(3),
      revisionPublicId: null,
    });
    renderForm(action);
    const user = userEvent.setup();
    const summary = screen.getByLabelText('สรุป');
    fireEvent.change(summary, { target: { value: 'ข้อความที่ต้องเก็บไว้หลังเกิด conflict' } });
    fireEvent.change(screen.getByLabelText('เหตุผลการแก้ไข'), {
      target: { value: 'แก้ข้อมูลให้ถูกต้องตามหลักฐาน' },
    });
    await user.click(screen.getByRole('button', { name: 'บันทึกเป็นฉบับรอตรวจ' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect((summary as HTMLTextAreaElement).value).toBe('ข้อความที่ต้องเก็บไว้หลังเกิด conflict');
  });
});

function renderForm(action: AdminCorrectionAction) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <AdminCorrectionForm action={action} base={base()} idempotencyKey={id(3)} />
    </NextIntlClientProvider>,
  );
}

function base(): AdminCorrectionBase {
  return {
    authorKind: 'student_submission',
    attributions: [],
    content: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดเดิม',
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      summary: 'สรุปเดิม',
      tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
      title: 'ชื่อเดิม',
      videoLinks: [],
    },
    media: [],
    number: 1,
    publicId: id(1),
    status: 'approved',
    submittedAt: '2026-08-26T07:00:00.000Z',
    version: 2,
    withdrawnAt: null,
    workPublicId: id(2),
  };
}

function id(value: number): string {
  return `93000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
