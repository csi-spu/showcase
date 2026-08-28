import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import type { WorkDraft } from '@/lib/student-works-core';
import { WorkForm } from './work-form';
import type { WorkActionState } from './work-action-state';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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

  it('guides creation through three clear steps and preserves the Work contract', async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    expect(screen.getByText('ขั้นที่ 1 จาก 3')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'รายละเอียดผลงาน' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'ประเภทและช่วงเวลา' })).toBeNull();
    expect(screen.getByLabelText('ชื่อผลงาน').getAttribute('maxlength')).toBe('150');
    expect(screen.getByLabelText('สรุปผลงาน').getAttribute('maxlength')).toBe('300');
    expect(screen.getByLabelText('รายละเอียดผลงาน').getAttribute('maxlength')).toBe('10000');

    await user.type(screen.getByLabelText('ชื่อผลงาน'), 'ระบบแนะนำผลงาน');
    await user.type(screen.getByLabelText('สรุปผลงาน'), 'สรุปสิ่งที่ผลงานทำ');
    await user.type(screen.getByLabelText('รายละเอียดผลงาน'), 'รายละเอียดและที่มาของผลงาน');
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(screen.getByText('ขั้นที่ 2 จาก 3')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'ประเภทผลงาน' })).toBeTruthy();
    const categoryInput = container.querySelector('input[name="category"]') as HTMLInputElement;
    for (const category of ['competition_entry', 'academic_article', 'course_work']) {
      fireEvent.change(categoryInput, { target: { value: category } });
      await waitFor(() => expect(categoryInput.value).toBe(category));
    }
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(screen.getByText('ขั้นที่ 3 จาก 3')).toBeTruthy();
    expect(screen.getAllByRole('textbox', { name: /ชื่อของลิงก์/ })).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: /URL ของลิงก์/ })).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: /แท็ก/ })).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: /URL วิดีโอ/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'เพิ่มลิงก์' }));
    await user.click(screen.getByRole('button', { name: 'เพิ่มแท็ก' }));
    await user.click(screen.getByRole('button', { name: 'เพิ่มวิดีโอ' }));
    expect(screen.getAllByRole('textbox', { name: /ชื่อของลิงก์/ })).toHaveLength(2);
    expect(screen.getAllByRole('textbox', { name: /แท็ก/ })).toHaveLength(2);
    expect(screen.getAllByRole('textbox', { name: /URL วิดีโอ/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'สร้างร่างและเพิ่มรูป' })).toBeTruthy();
    expect(screen.queryByText(/สื่อ|ผู้ร่วมผลงาน/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'ย้อนกลับ' }));
    await user.click(screen.getByRole('button', { name: 'ย้อนกลับ' }));
    expect((screen.getByLabelText('ชื่อผลงาน') as HTMLInputElement).value).toBe('ระบบแนะนำผลงาน');
  }, 20_000);

  it('keeps the Student on the current step when a required field is missing', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(screen.getByText('ขั้นที่ 1 จาก 3')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('ชื่อผลงาน'));
    expect(screen.getByText('กรุณากรอกข้อมูลจำเป็นให้ครบ')).toBeTruthy();
    expect(screen.getByText('กรุณากรอกชื่อผลงานไม่เกิน 150 ตัวอักษร')).toBeTruthy();
    expect(screen.getByText('กรุณากรอกสรุปไม่เกิน 300 ตัวอักษร')).toBeTruthy();
    expect(screen.getByText('กรุณากรอกรายละเอียดไม่เกิน 10,000 ตัวอักษร')).toBeTruthy();
  });

  it('shows prominent requirement badges, examples, and live character counts', async () => {
    const user = userEvent.setup();
    renderForm();

    for (const badge of visibleRequirementLabels('จำเป็น')) {
      expect(badge.getAttribute('data-slot')).toBe('badge');
      expect(badge.className).toContain('text-destructive');
    }
    expect(screen.getByLabelText('ชื่อผลงาน').getAttribute('placeholder')).toMatch(/SMS/);
    expect(screen.getByLabelText('สรุปผลงาน').getAttribute('placeholder')).toMatch(/ช่วยแก้ปัญหา/);
    expect(screen.getByLabelText('รายละเอียดผลงาน').getAttribute('placeholder')).toMatch(
      /ปัญหาที่พบ/,
    );
    expect(screen.getByText('0 / 300')).toBeTruthy();
    expect(screen.getByText('0 / 10,000')).toBeTruthy();

    await user.type(screen.getByLabelText('สรุปผลงาน'), 'abc');
    await user.type(screen.getByLabelText('รายละเอียดผลงาน'), 'hello');
    expect(screen.getByText('3 / 300')).toBeTruthy();
    expect(screen.getByText('5 / 10,000')).toBeTruthy();
  });

  it('marks required fields and optional groups and rejects whitespace-only content', async () => {
    const user = userEvent.setup();
    const action = vi.fn(successAction);
    renderForm({ action });

    expect(visibleRequirementLabels('จำเป็น')).toHaveLength(3);
    await user.type(screen.getByLabelText('ชื่อผลงาน'), '   ');
    await user.type(screen.getByLabelText('สรุปผลงาน'), 'สรุปผลงาน');
    await user.type(screen.getByLabelText('รายละเอียดผลงาน'), 'รายละเอียดผลงาน');
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(screen.getByText('กรุณากรอกชื่อผลงานไม่เกิน 150 ตัวอักษร')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('ชื่อผลงาน'));
    expect(action).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('ชื่อผลงาน'));
    await user.type(screen.getByLabelText('ชื่อผลงาน'), 'ระบบแนะนำผลงาน');
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    expect(visibleRequirementLabels('จำเป็น')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    expect(visibleRequirementLabels('ไม่บังคับ')).toHaveLength(3);
  });

  it('constrains Academic Period to the Submitter Entry Year through Current Academic Year', async () => {
    const user = userEvent.setup();
    renderForm();
    fillRequiredDetails();
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));

    const year = screen.getByLabelText('ปีการศึกษา') as HTMLInputElement;
    expect(year.min).toBe('2566');
    expect(year.max).toBe('2569');
    expect(screen.getByRole('combobox', { name: 'ภาคการศึกษา' })).toBeTruthy();
  });

  it('shows Thai field feedback and preserves entered data after a recoverable error', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<WorkActionState> => ({
      error: 'invalid',
      fieldErrors: ['links'],
      idempotencyKey: '64000000-0000-4000-8000-000000000002',
      success: false,
      version: null,
    }));
    renderForm({ action });
    const title = screen.getByLabelText('ชื่อผลงาน') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'ข้อมูลที่ต้องเก็บไว้' } });
    fireEvent.change(screen.getByLabelText('สรุปผลงาน'), { target: { value: 'สรุป' } });
    fireEvent.change(screen.getByLabelText('รายละเอียดผลงาน'), {
      target: { value: 'รายละเอียด' },
    });
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    fireEvent.change(screen.getByLabelText('URL ของลิงก์ 1'), {
      target: { value: 'http://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'สร้างร่างและเพิ่มรูป' }));

    await waitFor(() => expect(screen.getByText(/ลิงก์ต้องมีชื่อและใช้ HTTPS/)).toBeTruthy(), {
      timeout: 5_000,
    });
    expect(title.value).toBe('ข้อมูลที่ต้องเก็บไว้');
    expect(screen.getByLabelText('URL ของลิงก์ 1').getAttribute('aria-invalid')).toBe('true');
  }, 10_000);

  it('returns to the step containing a server-side field error', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<WorkActionState> => ({
      error: 'invalid',
      fieldErrors: ['academicPeriod'],
      idempotencyKey: '64000000-0000-4000-8000-000000000002',
      success: false,
      version: null,
    }));
    renderForm({ action });
    fillRequiredDetails();
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));

    await user.click(screen.getByRole('button', { name: 'สร้างร่างและเพิ่มรูป' }));

    await waitFor(
      () => {
        expect(screen.getByText('ขั้นที่ 2 จาก 3')).toBeTruthy();
        expect(screen.getByText(/ปีและภาคการศึกษาต้องอยู่ในช่วงสิทธิ์/)).toBeTruthy();
      },
      { timeout: 5_000 },
    );
  }, 10_000);

  it('submits values from every completed step when creating the private Draft', async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (previousState: WorkActionState, formData: FormData): Promise<WorkActionState> => {
        void previousState;
        void formData;
        return successAction();
      },
    );
    renderForm({ action });
    fillRequiredDetails();
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await user.type(screen.getByLabelText('แท็ก 1'), 'React');

    await user.click(screen.getByRole('button', { name: 'สร้างร่างและเพิ่มรูป' }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submittedForm = action.mock.calls[0]?.[1];
    expect(submittedForm?.get('title')).toBe('ระบบแนะนำผลงาน');
    expect(submittedForm?.get('academicYear')).toBe('2569');
    expect(submittedForm?.get('tag0')).toBe('React');
  });

  it('uses the same three-step authoring convention when editing an existing Draft', async () => {
    const user = userEvent.setup();
    const { container } = renderForm({
      mode: 'edit',
      publicId: '64000000-0000-4000-8000-000000000001',
      work: existingWork(),
    });

    expect(screen.getByText('ขั้นที่ 1 จาก 3')).toBeTruthy();
    expect((screen.getByLabelText('ชื่อผลงาน') as HTMLInputElement).value).toBe('ระบบแนะนำผลงาน');
    expect(
      (container.querySelector('input[name="expectedVersion"]') as HTMLInputElement).value,
    ).toBe('3');
    expect(screen.getByRole('heading', { name: /อัปโหลดโปสเตอร์\s*จำเป็น/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /อัปโหลดภาพแกลเลอรี\s*ไม่บังคับ/ })).toBeTruthy();
    expect(screen.getByLabelText('เลือกไฟล์โปสเตอร์').closest('[hidden]')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    expect(screen.getByText('ขั้นที่ 2 จาก 3')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    expect(screen.getByText('ขั้นที่ 3 จาก 3')).toBeTruthy();
    expect(screen.getAllByRole('textbox', { name: /ชื่อของลิงก์/ })).toHaveLength(2);
    expect(screen.getAllByRole('textbox', { name: /แท็ก/ })).toHaveLength(2);
    expect(screen.getAllByRole('textbox', { name: /URL วิดีโอ/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'บันทึกร่าง' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ส่งผลงานให้ผู้ดูแลตรวจ' })).toBeNull();
    expect(screen.queryByText(/เผยแพร่|ผู้ร่วมผลงาน/)).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกร่าง' }));

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

function fillRequiredDetails() {
  fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ระบบแนะนำผลงาน' } });
  fireEvent.change(screen.getByLabelText('สรุปผลงาน'), { target: { value: 'สรุปผลงาน' } });
  fireEvent.change(screen.getByLabelText('รายละเอียดผลงาน'), {
    target: { value: 'รายละเอียดผลงาน' },
  });
}

function visibleRequirementLabels(text: 'จำเป็น' | 'ไม่บังคับ') {
  return screen.getAllByText(text).filter((element) => element.closest('[hidden]') === null);
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
      videoLinks: [],
    },
    publicationState: 'never_published',
    publishedRevisionId: null,
    publicId: '64000000-0000-4000-8000-000000000001',
    version: 3,
  };
}
