import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollectionFormActionState } from '@/app/collection-forms-state';
import type { InstructorCollectionForm } from '@/lib/instructor-collection-forms-contract';
import { FormBuilder } from './form-builder';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

vi.mock('@showcase/ui/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      'Forms.builder.addField': 'เพิ่มคำถาม',
      'Forms.builder.allowedFileTypes': 'ชนิดไฟล์',
      'Forms.builder.cancel': 'ยกเลิก',
      'Forms.builder.collapseField': `ยุบคำถาม ${String(values?.index)}`,
      'Forms.builder.deadline': 'กำหนดส่ง',
      'Forms.builder.deadlineHint': 'เวลาประเทศไทย',
      'Forms.builder.description': 'คำอธิบายแบบฟอร์ม',
      'Forms.builder.detailsDescription': 'กำหนดชื่อ คำอธิบาย และกำหนดส่ง',
      'Forms.builder.detailsHeading': 'รายละเอียดแบบฟอร์ม',
      'Forms.builder.expandField': `แก้ไขคำถาม ${String(values?.index)}: ${String(values?.label)}`,
      'Forms.builder.fieldDescription': 'คำอธิบายเพิ่มเติม',
      'Forms.builder.fieldDescriptionHint': 'ช่วยให้นักศึกษาตอบได้ถูกต้อง',
      'Forms.builder.fieldLabel': 'คำถาม',
      'Forms.builder.fieldPosition': `คำถาม ${String(values?.index)}`,
      'Forms.builder.fieldType': 'ชนิดคำตอบ',
      'Forms.builder.fieldsDescription': 'เพิ่ม แก้ไข และจัดลำดับคำถาม',
      'Forms.builder.fieldsHeading': 'คำถามในแบบฟอร์ม',
      'Forms.builder.finalPreviewDescription': 'ตรวจรายละเอียดก่อนเปิดให้นักศึกษาตอบ',
      'Forms.builder.finalPreviewHeading': 'ตรวจสอบแบบฟอร์มครั้งสุดท้าย',
      'Forms.builder.mappingKey': 'รหัสค่าใช้ซ้ำ',
      'Forms.builder.mappingKeyHint': 'ใช้เติมคำตอบเดิม',
      'Forms.builder.mappingKeyPlaceholder': 'เช่น company-name',
      'Forms.builder.moveDown': 'เลื่อนลง',
      'Forms.builder.moveUp': 'เลื่อนขึ้น',
      'Forms.builder.open': 'เปิดรับคำตอบ',
      'Forms.builder.openConfirm': 'ยืนยันเปิดรับคำตอบ',
      'Forms.builder.openConfirmDescription': 'เปิดแล้วแก้คำถามไม่ได้',
      'Forms.builder.openConfirmTitle': 'เปิดรับคำตอบ?',
      'Forms.builder.openConfirmUnsaved': 'บันทึกการแก้ไขทั้งหมดก่อนเปิดรับคำตอบ',
      'Forms.builder.removeField': 'ลบคำถาม',
      'Forms.builder.required': 'ต้องตอบ',
      'Forms.builder.saveDetails': 'บันทึกรายละเอียด',
      'Forms.builder.saveStructure': 'บันทึกคำถาม',
      'Forms.builder.saving': 'กำลังบันทึก…',
      'Forms.builder.title': 'ชื่อแบบฟอร์ม',
      'Forms.fieldType.long_text': 'ข้อความยาว',
      'Forms.fieldType.short_text': 'ข้อความสั้น',
      'Forms.preview.requiredLabel': 'ต้องตอบ',
      'Forms.status.draft': 'แบบร่าง',
      'Forms.template.saveAction': 'บันทึกเป็นเทมเพลต',
    };
    return messages[`${namespace}.${key}`] ?? key;
  },
}));

const FORM: InstructorCollectionForm = {
  createdFromTemplateId: null,
  deadlineAt: null,
  description: 'กรอกข้อมูลสำหรับฝึกงาน',
  fields: [
    {
      description: 'ชื่อที่ใช้ในเอกสาร',
      id: 'name',
      label: 'ชื่อ-นามสกุล',
      required: true,
      type: 'short_text',
    },
    {
      description: '',
      id: 'reason',
      label: 'เหตุผลที่สมัคร',
      required: false,
      type: 'long_text',
    },
  ],
  groupId: '30000000-0000-4000-8000-000000000001',
  id: '40000000-0000-4000-8000-000000000001',
  status: 'draft',
  title: 'แบบฟอร์มฝึกงาน',
  version: 1,
};

const SUCCESS_STATE: CollectionFormActionState = {
  error: null,
  fieldId: null,
  submitted: true,
};

type BuilderAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;
type OpenAction = () => Promise<CollectionFormActionState>;

function action() {
  return vi.fn<BuilderAction>().mockResolvedValue(SUCCESS_STATE);
}

function openAction() {
  return vi.fn<OpenAction>().mockResolvedValue(SUCCESS_STATE);
}

function renderBuilder(overrides: Partial<InstructorCollectionForm> = {}) {
  const openFormAction = openAction();
  const saveStructureAction = action();
  render(
    <FormBuilder
      closeAction={action()}
      form={{ ...FORM, ...overrides }}
      openAction={openFormAction}
      reopenAction={action()}
      reopenNewlyAssignedCount={null}
      saveMetadataAction={action()}
      saveStructureAction={saveStructureAction}
      saveTemplateAction={action()}
    />,
  );
  return { openAction: openFormAction, saveStructureAction };
}

describe('FormBuilder draft editing', () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
  });

  it('uses one smooth accordion editor and removes the realtime preview', async () => {
    const user = userEvent.setup();
    renderBuilder();

    expect(screen.queryByText('builder.previewLive')).toBeNull();
    const firstToggle = screen.getByRole('button', { name: 'ยุบคำถาม 1' });
    const secondToggle = screen.getByRole('button', { name: 'แก้ไขคำถาม 2: เหตุผลที่สมัคร' });
    expect(firstToggle.getAttribute('aria-expanded')).toBe('true');
    expect(secondToggle.getAttribute('aria-expanded')).toBe('false');

    const secondCard = secondToggle.closest('li');
    expect(secondCard).not.toBeNull();
    const collapsedContent = secondCard?.querySelector('[data-slot="field-editor-content"]');
    expect(collapsedContent?.className).toContain('grid-rows-[0fr]');
    expect(collapsedContent?.className).toContain('motion-reduce:transition-none');

    await user.click(secondToggle);
    expect(secondToggle.getAttribute('aria-expanded')).toBe('true');
    expect(firstToggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands a newly added question and collapses all questions after save', async () => {
    const user = userEvent.setup();
    const { saveStructureAction } = renderBuilder();

    await user.click(screen.getByRole('button', { name: 'เพิ่มคำถาม' }));
    const newQuestionToggle = screen.getByRole('button', { name: /ยุบคำถาม 3/ });
    expect(newQuestionToggle.getAttribute('aria-expanded')).toBe('true');

    const newCard = newQuestionToggle.closest('li');
    expect(newCard).not.toBeNull();
    await user.type(within(newCard!).getByLabelText('คำถาม'), 'แผนการทำงาน');
    await user.click(screen.getByRole('button', { name: 'บันทึกคำถาม' }));

    await waitFor(() => expect(saveStructureAction).toHaveBeenCalledOnce());
    expect(newQuestionToggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the final preview only inside the open confirmation', async () => {
    const user = userEvent.setup();
    renderBuilder();

    expect(screen.queryByText('ตรวจสอบแบบฟอร์มครั้งสุดท้าย')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'เปิดรับคำตอบ' }));

    const dialog = screen.getByRole('alertdialog', { name: 'เปิดรับคำตอบ?' });
    expect(within(dialog).getByText('ตรวจสอบแบบฟอร์มครั้งสุดท้าย')).toBeDefined();
    expect(within(dialog).getByText('แบบฟอร์มฝึกงาน')).toBeDefined();
    expect(within(dialog).getByText('ชื่อ-นามสกุล')).toBeDefined();
    expect(
      within(dialog).getByRole('button', { name: 'ยืนยันเปิดรับคำตอบ' }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('prevents opening a preview that still contains unsaved changes', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), ' ฉบับแก้ไข');
    await user.click(screen.getByRole('button', { name: 'เปิดรับคำตอบ' }));

    const dialog = screen.getByRole('alertdialog', { name: 'เปิดรับคำตอบ?' });
    expect(within(dialog).getByText('บันทึกการแก้ไขทั้งหมดก่อนเปิดรับคำตอบ')).toBeDefined();
    expect(
      within(dialog).getByRole('button', { name: 'ยืนยันเปิดรับคำตอบ' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
