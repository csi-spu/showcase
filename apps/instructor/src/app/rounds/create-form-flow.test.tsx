import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollectionFormActionState } from '../collection-forms-state';
import type { CreateFormGroupAction } from '../collection-groups-state';
import { CreateFormFlow } from './create-form-flow';

type FlowCreateFormAction = (
  groupId: string,
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      'Forms.builder.cancel': 'ยกเลิก',
      'Forms.builder.title': 'ชื่อแบบฟอร์ม',
      'Forms.createFlow.back': 'ย้อนกลับ',
      'Forms.createFlow.chooseGroup': 'เลือกกลุ่ม',
      'Forms.createFlow.continue': 'ถัดไป',
      'Forms.createFlow.createGroup': 'สร้างกลุ่มใหม่',
      'Forms.createFlow.createGroupConfirm': 'สร้างกลุ่มและไปต่อ',
      'Forms.createFlow.description': 'เลือกกลุ่ม หรือสร้างกลุ่มใหม่หากยังไม่มี',
      'Forms.createFlow.formDescription': 'ตั้งชื่อ แล้วไปจัดคำถามในหน้าถัดไป',
      'Forms.createFlow.groupName': 'ชื่อกลุ่ม',
      'Forms.createFlow.hideCreateGroup': 'กลับไปเลือกกลุ่ม',
      'Forms.createFlow.newRound': 'สร้างชุดงานใหม่',
      'Forms.createFlow.noGroups': 'ยังไม่มีกลุ่ม',
      'Forms.createFlow.round': 'ชุดงาน',
      'Forms.createFlow.roundName': 'ชื่อชุดงาน',
      'Forms.createFlow.search': 'ค้นหากลุ่ม',
      'Forms.createFlow.selectedContext': `${String(values?.group)} ใน ${String(values?.round)}`,
      'Forms.createFlow.step': `ขั้นตอน ${String(values?.current)} จาก 2`,
      'Forms.createFlow.title': 'สร้างแบบฟอร์ม',
      'Forms.list.createConfirm': 'สร้างแบบร่าง',
      'Forms.list.starterFieldLabel': 'คำถามแรก',
      'Groups.saving': 'กำลังบันทึก…',
    };
    return messages[`${namespace}.${key}`] ?? key;
  },
}));

const round = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'ภาคเรียน 1/2569',
};
const group = {
  id: '30000000-0000-4000-8000-000000000001',
  name: 'นักศึกษาปี 4',
  roundId: round.id,
};

describe('CreateFormFlow', () => {
  afterEach(() => {
    cleanup();
    replace.mockReset();
  });

  it('selects an existing Group before asking for the Form name', async () => {
    const user = userEvent.setup();
    const createFormAction = vi.fn<FlowCreateFormAction>().mockResolvedValue({
      error: 'invalid' as const,
      fieldId: null,
      submitted: true,
    });

    render(
      <CreateFormFlow
        createFormAction={createFormAction}
        defaultOpen
        groups={[group]}
        rounds={[round]}
        setupAction={async (state) => state}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'สร้างแบบฟอร์ม' })).toBeDefined();
    expect(screen.queryByLabelText('ชื่อแบบฟอร์ม')).toBeNull();
    await user.click(screen.getByRole('button', { name: /นักศึกษาปี 4/ }));
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(screen.getByLabelText('ชื่อแบบฟอร์ม')).toBeDefined();
    expect(screen.getByText('นักศึกษาปี 4 ใน ภาคเรียน 1/2569')).toBeDefined();

    await user.type(screen.getByLabelText('ชื่อแบบฟอร์ม'), 'แบบฟอร์มฝึกงาน');
    await user.click(screen.getByRole('button', { name: 'สร้างแบบร่าง' }));
    await waitFor(() => expect(createFormAction).toHaveBeenCalledOnce());
    expect(createFormAction.mock.calls[0]?.[0]).toBe(group.id);
  });

  it('creates the first Round and Group inline, then continues in the same modal', async () => {
    const user = userEvent.setup();
    const setupAction = vi.fn<CreateFormGroupAction>().mockResolvedValue({
      error: null,
      group,
      round,
    });

    render(
      <CreateFormFlow
        createFormAction={async (_groupId, state) => state}
        defaultOpen
        groups={[]}
        rounds={[]}
        setupAction={setupAction}
      />,
    );

    await user.type(screen.getByLabelText('ชื่อชุดงาน'), round.name);
    await user.type(screen.getByLabelText('ชื่อกลุ่ม'), group.name);
    await user.click(screen.getByRole('button', { name: 'สร้างกลุ่มและไปต่อ' }));

    await waitFor(() => expect(setupAction).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('ชื่อแบบฟอร์ม')).toBeDefined();
    expect(screen.getByText('นักศึกษาปี 4 ใน ภาคเรียน 1/2569')).toBeDefined();
  });

  it('creates a Group under an existing Round without asking for a new Round name', async () => {
    const user = userEvent.setup();
    const setupAction = vi.fn<CreateFormGroupAction>().mockResolvedValue({
      error: null,
      group,
      round: null,
    });

    render(
      <CreateFormFlow
        createFormAction={async (_groupId, state) => state}
        defaultOpen
        groups={[]}
        rounds={[round]}
        setupAction={setupAction}
      />,
    );

    expect(screen.queryByLabelText('ชื่อชุดงาน')).toBeNull();
    await user.type(screen.getByLabelText('ชื่อกลุ่ม'), group.name);
    await user.click(screen.getByRole('button', { name: 'สร้างกลุ่มและไปต่อ' }));

    await waitFor(() => expect(setupAction).toHaveBeenCalledOnce());
    const submitted = setupAction.mock.calls[0]?.[1];
    expect(submitted?.get('mode')).toBe('existing-round');
    expect(submitted?.get('roundId')).toBe(round.id);
  });
});
