import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import type { WorkDraft } from '@/lib/student-works-core';
import { WorkForm } from './work-form';
import type { WorkActionState } from './work-action-state';

const successAction = vi.fn(async (): Promise<WorkActionState> => ({
  error: null,
  fieldErrors: [],
  idempotencyKey: '64000000-0000-4000-8000-000000000003',
  success: true,
  version: null,
}));

describe('Student Work Draft form', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders one accessible generic contract for every Work Category', async () => {
    renderForm();

    expect(screen.getByLabelText('ชื่อผลงาน').getAttribute('maxlength')).toBe('150');
    expect(screen.getByLabelText('สรุปผลงาน').getAttribute('maxlength')).toBe('300');
    expect(screen.getByLabelText('รายละเอียดผลงาน').getAttribute('maxlength')).toBe('10000');
    expect(screen.getByRole('combobox', { name: 'ประเภทผลงาน' })).toBeTruthy();
    await userEvent.click(screen.getByRole('combobox', { name: 'ประเภทผลงาน' }));
    expect(screen.getAllByText('ผลงานรายวิชา').length).toBeGreaterThan(0);
    expect(screen.getByText('ผลงานประกวด')).toBeTruthy();
    expect(screen.getByText('บทความวิชาการ')).toBeTruthy();
    expect(screen.getAllByRole('textbox', { name: /ชื่อของลิงก์/ })).toHaveLength(5);
    expect(screen.getAllByRole('textbox', { name: /URL ของลิงก์/ })).toHaveLength(5);
    expect(screen.getAllByRole('textbox', { name: /แท็ก/ })).toHaveLength(5);
    expect(screen.queryByText(/สื่อ|ผู้ร่วมผลงาน/)).toBeNull();
  });

  it('constrains Academic Period to the Submitter Entry Year through Current Academic Year', () => {
    renderForm();

    const year = screen.getByLabelText('ปีการศึกษา') as HTMLInputElement;
    expect(year.min).toBe('2566');
    expect(year.max).toBe('2569');
    expect(screen.getByRole('combobox', { name: 'ภาคการศึกษา' })).toBeTruthy();
  });

  it('shows Thai field feedback and preserves entered data after a recoverable error', async () => {
    const action = vi.fn(async (): Promise<WorkActionState> => ({
      error: 'invalid',
      fieldErrors: ['links'],
      idempotencyKey: '64000000-0000-4000-8000-000000000002',
      success: false,
      version: null,
    }));
    renderForm({ action });
    const title = screen.getByLabelText('ชื่อผลงาน') as HTMLInputElement;
    await userEvent.clear(title);
    await userEvent.type(title, 'ข้อมูลที่ต้องเก็บไว้');
    await userEvent.type(screen.getByLabelText('สรุปผลงาน'), 'สรุป');
    await userEvent.type(screen.getByLabelText('รายละเอียดผลงาน'), 'รายละเอียด');
    await userEvent.type(screen.getByLabelText('URL ของลิงก์ 1'), 'http://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'สร้างผลงาน' }));

    await waitFor(() => expect(screen.getByText(/ลิงก์ต้องมีชื่อและใช้ HTTPS/)).toBeTruthy());
    expect(title.value).toBe('ข้อมูลที่ต้องเก็บไว้');
    expect(screen.getByLabelText('URL ของลิงก์ 1').getAttribute('aria-invalid')).toBe('true');
  });

  it('prefills an existing Draft and submits its expected version without public state controls', () => {
    const { container } = renderForm({ mode: 'edit', work: existingWork() });

    expect((screen.getByLabelText('ชื่อผลงาน') as HTMLInputElement).value).toBe('ระบบแนะนำผลงาน');
    expect(
      (container.querySelector('input[name="expectedVersion"]') as HTMLInputElement).value,
    ).toBe('3');
    expect(screen.getByRole('button', { name: 'บันทึกร่าง' })).toBeTruthy();
    expect(screen.queryByText(/เผยแพร่|ส่งตรวจ|ผู้ร่วมผลงาน|อัปโหลด/)).toBeNull();
  });

  it('advances version and rotates the idempotency key after a successful edit', async () => {
    const action = vi.fn(async (): Promise<WorkActionState> => ({
      error: null,
      fieldErrors: [],
      idempotencyKey: '64000000-0000-4000-8000-000000000004',
      success: true,
      version: 4,
    }));
    const { container } = renderForm({ action, mode: 'edit', work: existingWork() });

    await userEvent.click(screen.getByRole('button', { name: 'บันทึกร่าง' }));

    await waitFor(() => {
      expect(
        (container.querySelector('input[name="expectedVersion"]') as HTMLInputElement).value,
      ).toBe('4');
      expect(
        (container.querySelector('input[name="idempotencyKey"]') as HTMLInputElement).value,
      ).toBe('64000000-0000-4000-8000-000000000004');
    });
  });
});

function renderForm(overrides: Partial<React.ComponentProps<typeof WorkForm>> = {}) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <WorkForm
        action={successAction}
        context={{ currentAcademicYear: 2569, entryYear: 2566 }}
        idempotencyKey="64000000-0000-4000-8000-000000000002"
        mode="create"
        work={null}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

function existingWork(): WorkDraft {
  return {
    activityState: 'active',
    basePublishedRevisionId: null,
    draft: {
      academicPeriod: { semester: '2', year: 2568 },
      category: 'course_work',
      description: 'รายละเอียดผลงาน',
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      summary: 'สรุปผลงาน',
      tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
      title: 'ระบบแนะนำผลงาน',
    },
    publicationState: 'never_published',
    publicId: '64000000-0000-4000-8000-000000000001',
    version: 3,
  };
}
