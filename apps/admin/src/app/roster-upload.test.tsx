import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { RosterUploadAction } from './roster-upload-state';
import { RosterBatchStatusView } from './roster-batch-status';
import { RosterUploadForm } from './roster-upload-form';

function renderWithMessages(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('Admin Roster upload', () => {
  afterEach(cleanup);

  it('submits selected Entry Year and CSV only through the supplied Server Action', async () => {
    const action = vi.fn<RosterUploadAction>().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderWithMessages(<RosterUploadForm action={action} />);
    const file = new File(
      ['student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี'],
      'roster.csv',
      { type: 'text/csv' },
    );

    await user.type(screen.getByLabelText('ปีแรกเข้า (พ.ศ.)'), '2569');
    await user.upload(screen.getByLabelText('ไฟล์รายชื่อนักศึกษา'), file);
    const form = screen.getByRole('button', { name: 'เริ่มนำเข้ารายชื่อ' }).closest('form');
    if (form === null) throw new Error('Expected upload form');
    form.noValidate = true;
    await user.click(screen.getByRole('button', { name: 'เริ่มนำเข้ารายชื่อ' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('entryYear')).toBe('2569');
    const submittedFile = formData?.get('rosterFile');
    expect(submittedFile).toBeInstanceOf(File);
  });

  it('renders durable determinate progress and safe outcome counts', () => {
    renderWithMessages(
      <RosterBatchStatusView
        batch={{
          batchId: '20000000-0000-4000-8000-000000000001',
          createdCount: 7,
          entryYear: 2569,
          failedCount: 0,
          processedRowCount: 10,
          status: 'completed',
          totalRowCount: 10,
          unchangedCount: 3,
          uploadedAt: '2026-08-25T06:00:00.000Z',
        }}
        labels={{
          created: 'สร้างใหม่',
          entryYear: 'ปีแรกเข้า 2569',
          failed: 'ไม่สำเร็จ',
          progress: 'ความคืบหน้าการนำเข้า',
          refresh: 'อัปเดตสถานะ',
          status: 'นำเข้าสำเร็จ',
          unchanged: 'ข้อมูลเดิม',
          uploadedAt: 'อัปโหลดเมื่อ 25 ส.ค. 2569 13:00',
        }}
      />,
    );

    expect(
      (
        screen.getByRole('progressbar', {
          name: 'ความคืบหน้าการนำเข้า',
        }) as HTMLProgressElement
      ).value,
    ).toBe(10);
    expect(screen.getByText('สร้างใหม่ 7 รายการ', { selector: '.sr-only' })).toBeTruthy();
    expect(screen.getByText('ข้อมูลเดิม 3 รายการ', { selector: '.sr-only' })).toBeTruthy();
    expect(screen.queryByText('69000001')).toBeNull();
    expect(screen.getByRole('link', { name: 'อัปเดตสถานะ' }).getAttribute('href')).toBe(
      '/?batchId=20000000-0000-4000-8000-000000000001',
    );
  });

  it('moves focus to an actionable upload error summary', async () => {
    const action = vi.fn<RosterUploadAction>().mockResolvedValue({ error: 'fileInvalid' });
    const user = userEvent.setup();
    renderWithMessages(<RosterUploadForm action={action} />);
    const button = screen.getByRole('button', { name: 'เริ่มนำเข้ารายชื่อ' });
    const form = button.closest('form');
    if (form === null) throw new Error('Expected upload form');
    form.noValidate = true;

    await user.click(button);

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain('ไฟล์ไม่ตรงรูปแบบที่กำหนด');
  });
});
