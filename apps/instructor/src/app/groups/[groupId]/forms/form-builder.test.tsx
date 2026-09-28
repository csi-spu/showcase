import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionFormActionState, SaveFormActionState } from '@/app/collection-forms-state';
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
      'Forms.builder.dragHandle': 'ลากเพื่อย้าย',
      'Forms.builder.dragHandleLabel': `ย้ายคำถาม ${String(values?.label)}`,
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
      'Forms.builder.liveEditingDescription': 'มีผลกับคำตอบครั้งถัดไป',
      'Forms.builder.liveEditingTitle': 'แก้ไขฟอร์มที่เปิดอยู่',
      'Forms.builder.open': 'เปิดรับคำตอบ',
      'Forms.builder.openConfirm': 'ยืนยันเปิดรับคำตอบ',
      'Forms.builder.openConfirmDescription': 'เปิดแล้วแก้คำถามไม่ได้',
      'Forms.builder.openConfirmTitle': 'เปิดรับคำตอบ?',
      'Forms.builder.openConfirmUnsaved': 'บันทึกการแก้ไขทั้งหมดก่อนเปิดรับคำตอบ',
      'Forms.builder.removeField': 'ลบคำถาม',
      'Forms.builder.reorder.cancelled': `ยกเลิกการย้าย ${String(values?.label)}`,
      'Forms.builder.reorder.dropped': `วาง ${String(values?.label)} ที่ ${String(values?.position)}`,
      'Forms.builder.reorder.instructions': 'กด Space เพื่อยก',
      'Forms.builder.reorder.moved': `ย้าย ${String(values?.label)} ไป ${String(values?.position)}`,
      'Forms.builder.reorder.picked': `ยก ${String(values?.label)}`,
      'Forms.builder.reorder.roleDescription': 'คำถามที่จัดลำดับได้',
      'Forms.builder.reorderHint': 'ลากที่ไอคอน ⋮⋮ เพื่อจัดลำดับคำถาม',
      'Forms.builder.required': 'ต้องตอบ',
      'Forms.builder.save': 'บันทึก',
      'Forms.builder.saving': 'กำลังบันทึก…',
      'Forms.builder.title': 'ชื่อแบบฟอร์ม',
      'Forms.builder.unsaved': 'ยังไม่ได้บันทึก',
      'Forms.fieldType.long_text': 'ข้อความยาว',
      'Forms.fieldType.short_text': 'ข้อความสั้น',
      'Forms.preview.requiredLabel': 'ต้องตอบ',
      'Forms.status.draft': 'แบบร่าง',
      'Forms.status.open': 'เปิดรับคำตอบ',
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
type SaveAction = (state: SaveFormActionState, formData: FormData) => Promise<SaveFormActionState>;

function action() {
  return vi.fn<BuilderAction>().mockResolvedValue(SUCCESS_STATE);
}

function openAction() {
  return vi.fn<OpenAction>().mockResolvedValue(SUCCESS_STATE);
}

function saveAction(version = 2) {
  return vi.fn<SaveAction>().mockResolvedValue({ ...SUCCESS_STATE, version });
}

function renderBuilder(
  overrides: Partial<InstructorCollectionForm> = {},
  saveFormAction = saveAction(),
) {
  const openFormAction = openAction();
  render(
    <FormBuilder
      closeAction={action()}
      form={{ ...FORM, ...overrides }}
      openAction={openFormAction}
      reopenAction={action()}
      reopenNewlyAssignedCount={null}
      saveAction={saveFormAction}
      saveTemplateAction={action()}
    />,
  );
  return { openAction: openFormAction, saveAction: saveFormAction };
}

function submittedForm(save: ReturnType<typeof saveAction>, call = 0) {
  const submitted = save.mock.calls[call]?.[1];
  expect(submitted).toBeInstanceOf(FormData);
  return submitted!;
}

function submittedFieldIds(save: ReturnType<typeof saveAction>, call = 0) {
  const fields = JSON.parse(String(submittedForm(save, call).get('fields'))) as { id: string }[];
  return fields.map((field) => field.id);
}

/** The drag-and-drop live region: what a screen reader announces last. */
function announcement() {
  return screen.getByRole('status', { hidden: true }).textContent;
}

function questionOrder() {
  return screen.getAllByLabelText('คำถาม').map((input) => (input as HTMLInputElement).value);
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
    const { saveAction: save } = renderBuilder();

    await user.click(screen.getByRole('button', { name: 'เพิ่มคำถาม' }));
    const newQuestionToggle = screen.getByRole('button', { name: /ยุบคำถาม 3/ });
    expect(newQuestionToggle.getAttribute('aria-expanded')).toBe('true');

    const newCard = newQuestionToggle.closest('li');
    expect(newCard).not.toBeNull();
    await user.type(within(newCard!).getByLabelText('คำถาม'), 'แผนการทำงาน');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() => expect(newQuestionToggle.getAttribute('aria-expanded')).toBe('false'));
    expect(save).toHaveBeenCalledOnce();
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

  it('keeps the question editor available after opening', () => {
    renderBuilder({ status: 'open', version: 4 });

    expect(screen.getByRole('button', { name: 'เพิ่มคำถาม' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeDefined();
    expect(screen.getByText('แก้ไขฟอร์มที่เปิดอยู่')).toBeDefined();
  });

  it('assigns a new field id when the answer type changes', async () => {
    const user = userEvent.setup();
    const { saveAction: save } = renderBuilder();

    await user.selectOptions(screen.getAllByLabelText('ชนิดคำตอบ')[0]!, 'long_text');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());

    const submitted = submittedForm(save);
    expect(submitted.get('expectedVersion')).toBe('1');
    const fields = JSON.parse(String(submitted.get('fields'))) as { id: string; type: string }[];
    expect(fields[0]?.type).toBe('long_text');
    expect(fields[0]?.id).not.toBe('name');
  });

  it('saves details and questions together with one expected version', async () => {
    const user = userEvent.setup();
    const { saveAction: save } = renderBuilder();

    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), ' 2569');
    await user.type(screen.getByLabelText('กำหนดส่ง'), '2026-10-01T17:00');
    await user.click(screen.getByRole('button', { name: 'เพิ่มคำถาม' }));
    await user.type(screen.getAllByLabelText('คำถาม')[2]!, 'แผนการทำงาน');
    expect(screen.getAllByText('ยังไม่ได้บันทึก')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const submitted = submittedForm(save);
    expect(submitted.get('title')).toBe('แบบฟอร์มฝึกงาน 2569');
    expect(submitted.get('description')).toBe('กรอกข้อมูลสำหรับฝึกงาน');
    expect(submitted.get('deadlineAt')).toBe('2026-10-01T17:00');
    expect(submitted.get('expectedVersion')).toBe('1');
    const fields = JSON.parse(String(submitted.get('fields'))) as { label: string }[];
    expect(fields.map((field) => field.label)).toEqual([
      'ชื่อ-นามสกุล',
      'เหตุผลที่สมัคร',
      'แผนการทำงาน',
    ]);
    await waitFor(() => expect(screen.queryByText('ยังไม่ได้บันทึก')).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('sends the saved version with a second save made before the page refreshes', async () => {
    const user = userEvent.setup();
    const { saveAction: save } = renderBuilder();

    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), ' ก');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), 'ข');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(submittedForm(save, 1).get('expectedVersion')).toBe('2');
  });

  it('still marks an edit made while a save is in flight as unsaved', async () => {
    const user = userEvent.setup();
    let finishSave: (state: SaveFormActionState) => void = () => undefined;
    const save = vi.fn<SaveAction>(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    renderBuilder({}, save);

    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), ' ก');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), 'ข');
    finishSave({ ...SUCCESS_STATE, version: 2 });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByText('ยังไม่ได้บันทึก')).toBeDefined();
  });

  it('keeps every edit when the form changed elsewhere', async () => {
    const user = userEvent.setup();
    const save = vi
      .fn<SaveAction>()
      .mockResolvedValue({ error: 'formStale', fieldId: null, submitted: false, version: null });
    renderBuilder({}, save);

    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), ' ฉบับแก้ไข');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect((await screen.findByRole('alert')).textContent).toContain('formStale');
    expect(save).toHaveBeenCalledOnce();
    expect((screen.getByLabelText('ชื่อแบบฟอร์ม') as HTMLInputElement).value).toBe(
      'แบบฟอร์มฝึกงาน ฉบับแก้ไข',
    );
    expect(screen.getByText('ยังไม่ได้บันทึก')).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('moves focus to the title when Core rejects the details', async () => {
    const user = userEvent.setup();
    const save = vi
      .fn<SaveAction>()
      .mockResolvedValue({ error: 'formInvalid', fieldId: null, submitted: false, version: null });
    renderBuilder({}, save);

    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), ' ฉบับแก้ไข');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    const title = screen.getByLabelText('ชื่อแบบฟอร์ม');
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(title.getAttribute('aria-describedby')!)?.textContent).toBe(
      'formInvalid',
    );
  });
});

describe('FormBuilder question ordering', () => {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    /*
     * jsdom has no layout. Stack the question cards 100px apart, in their
     * current DOM order, so dnd-kit's keyboard coordinates find a neighbour.
     */
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement,
    ) {
      if (this.tagName !== 'LI' || this.parentElement === null) {
        return originalGetBoundingClientRect.call(this);
      }
      const top = Array.from(this.parentElement.children).indexOf(this) * 100;
      return {
        bottom: top + 80,
        height: 80,
        left: 0,
        right: 600,
        toJSON: () => ({}),
        top,
        width: 600,
        x: 0,
        y: top,
      };
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    cleanup();
    refresh.mockReset();
  });

  it('replaces the move buttons with a labelled drag handle', () => {
    renderBuilder();

    expect(screen.queryByRole('button', { name: 'เลื่อนขึ้น' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'เลื่อนลง' })).toBeNull();
    expect(screen.getByText('ลากที่ไอคอน ⋮⋮ เพื่อจัดลำดับคำถาม')).toBeDefined();
    const handle = screen.getByRole('button', { name: 'ย้ายคำถาม ชื่อ-นามสกุล' });
    expect(handle.getAttribute('aria-roledescription')).toBe('คำถามที่จัดลำดับได้');
    expect(screen.getAllByRole('button', { name: 'ลบคำถาม' })).toHaveLength(2);
  });

  it('reorders a question from the keyboard and saves the new order', async () => {
    const user = userEvent.setup();
    const { saveAction: save } = renderBuilder();

    screen.getByRole('button', { name: 'ย้ายคำถาม ชื่อ-นามสกุล' }).focus();
    await user.keyboard('[Space]');
    await waitFor(() => expect(announcement()).toBe('ยก ชื่อ-นามสกุล'));
    await user.keyboard('[ArrowDown]');
    await waitFor(() => expect(announcement()).toBe('ย้าย ชื่อ-นามสกุล ไป 2'));
    await user.keyboard('[Space]');
    await waitFor(() => expect(announcement()).toBe('วาง ชื่อ-นามสกุล ที่ 2'));

    await waitFor(() => expect(questionOrder()).toEqual(['เหตุผลที่สมัคร', 'ชื่อ-นามสกุล']));
    expect(screen.getByText('ยังไม่ได้บันทึก')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(submittedFieldIds(save)).toEqual(['reason', 'name']);
  });

  it('leaves the order and the saved state alone when a move is cancelled', async () => {
    const user = userEvent.setup();
    renderBuilder();

    screen.getByRole('button', { name: 'ย้ายคำถาม ชื่อ-นามสกุล' }).focus();
    await user.keyboard('[Space]');
    await user.keyboard('[ArrowDown]');
    await user.keyboard('[Escape]');

    await waitFor(() => expect(announcement()).toContain('ยกเลิกการย้าย'));
    expect(questionOrder()).toEqual(['ชื่อ-นามสกุล', 'เหตุผลที่สมัคร']);
    expect(screen.queryByText('ยังไม่ได้บันทึก')).toBeNull();
  });
});
