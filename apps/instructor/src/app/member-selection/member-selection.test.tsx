import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MemberSelectionReads,
  SelectableStudent,
  StudentIdResolution,
} from '@/lib/member-selection-contract';
import { MemberSelection, type MemberSubmitResult } from './member-selection';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));

function student(index: number): SelectableStudent {
  return {
    accountId: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    entryYear: 2566,
    firstNameTh: `ชื่อ${index}`,
    lastNameTh: `สกุล${index}`,
    status: 'selectable',
  };
}

function reads(overrides: Partial<MemberSelectionReads> = {}): MemberSelectionReads {
  return {
    listEntryYears: async () => ({ entryYears: [2566], ok: true }),
    listStudents: async () => ({
      hasCurrentAcademicYear: true,
      nextCursor: null,
      ok: true,
      students: [student(1), student(2)],
    }),
    resolveStudentIds: async () => ({ error: 'unavailable', ok: false }),
    selectAll: async () => ({ error: 'unavailable', ok: false }),
    ...overrides,
  };
}

function csvFile(): File {
  return new File(['student_id,note\n65000001,a\n65000002,b\nabc,c\n'], 'members.csv', {
    type: 'text/csv',
  });
}

const RESOLVED: StudentIdResolution[] = [
  { outcome: 'matched', position: 0, student: student(3) },
  { outcome: 'not_found', position: 1 },
];

afterEach(cleanup);

describe('MemberSelection', () => {
  it('adds CSV matches and names unmatched lines by the IDs read in the browser', async () => {
    const user = userEvent.setup();
    const resolveStudentIds = vi
      .fn<MemberSelectionReads['resolveStudentIds']>()
      .mockResolvedValue({ ok: true, results: RESOLVED });
    const submit = vi
      .fn<(formData: FormData) => Promise<MemberSubmitResult>>()
      .mockResolvedValue({ error: null, ineligibleAccountIds: [] });

    render(
      <MemberSelection
        groupId={null}
        reads={reads({ resolveStudentIds })}
        submit={submit}
        submitLabel="createSubmit"
      />,
    );
    await user.upload(screen.getByLabelText('csvLabel'), csvFile());

    expect(await screen.findByText('problem.not_found 3 65000002')).toBeDefined();
    expect(screen.getByText('problem.invalid_format 4 abc')).toBeDefined();
    expect(resolveStudentIds).toHaveBeenCalledWith({
      groupId: null,
      studentIds: ['65000001', '65000002'],
    });

    await user.click(screen.getByRole('button', { name: 'review' }));
    const list = screen.getByRole('list', { name: 'confirmListLabel' });
    expect(within(list).getByText(/ชื่อ3 สกุล3/)).toBeDefined();
    expect(screen.getByText('confirmTotal 1')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'createSubmit' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]?.[0].get('memberAccountIds')).toBe(
      JSON.stringify([student(3).accountId]),
    );
  });

  it('blocks review until a failed CSV chunk is retried', async () => {
    const user = userEvent.setup();
    const resolveStudentIds = vi
      .fn<MemberSelectionReads['resolveStudentIds']>()
      .mockResolvedValueOnce({ error: 'unavailable', ok: false })
      .mockResolvedValueOnce({ ok: true, results: RESOLVED });

    render(
      <MemberSelection
        groupId={null}
        reads={reads({ resolveStudentIds })}
        submit={async () => ({ error: null, ineligibleAccountIds: [] })}
        submitLabel="createSubmit"
      />,
    );
    await user.click(await screen.findByRole('checkbox', { name: 'selectStudent ชื่อ1 สกุล1' }));
    await user.upload(screen.getByLabelText('csvLabel'), csvFile());

    const retry = await screen.findByRole('button', { name: 'csvRetry' });
    expect(screen.getByText('csvBlocking')).toBeDefined();
    expect(screen.getByRole('button', { name: 'review' })).toHaveProperty('disabled', true);
    await user.click(retry);
    await screen.findByText('problem.not_found 3 65000002');
    expect(screen.getByRole('button', { name: 'review' })).toHaveProperty('disabled', false);
    expect(resolveStudentIds).toHaveBeenCalledTimes(2);
  });

  it('names Students the recheck refused and submits the rest', async () => {
    const user = userEvent.setup();
    const submit = vi
      .fn<(formData: FormData) => Promise<MemberSubmitResult>>()
      .mockResolvedValueOnce({
        error: 'memberNotSelectable',
        ineligibleAccountIds: [student(2).accountId],
      })
      .mockResolvedValueOnce({ error: null, ineligibleAccountIds: [] });

    render(
      <MemberSelection
        groupId="30000000-0000-4000-8000-000000000001"
        openFormsCount={2}
        reads={reads()}
        submit={submit}
        submitLabel="addSubmit"
      />,
    );
    await user.click(await screen.findByRole('checkbox', { name: 'selectStudent ชื่อ1 สกุล1' }));
    await user.click(screen.getByRole('checkbox', { name: 'selectStudent ชื่อ2 สกุล2' }));
    await user.click(screen.getByRole('button', { name: 'review' }));
    expect(screen.getByText('confirmOpenForms 2')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'addSubmit' }));
    expect(await screen.findByText('ineligibleTitle')).toBeDefined();
    expect(screen.getByText('confirmTotal 1')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'addSubmit' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]?.[0].get('memberAccountIds')).toBe(
      JSON.stringify([student(1).accountId]),
    );
  });

  it('stays on the table after the recheck refuses everyone', async () => {
    const user = userEvent.setup();
    const submit = vi.fn<(formData: FormData) => Promise<MemberSubmitResult>>().mockResolvedValue({
      error: 'memberNotSelectable',
      ineligibleAccountIds: [student(1).accountId],
    });

    render(
      <MemberSelection groupId={null} reads={reads()} submit={submit} submitLabel="createSubmit" />,
    );
    await user.click(await screen.findByRole('checkbox', { name: 'selectStudent ชื่อ1 สกุล1' }));
    await user.click(screen.getByRole('button', { name: 'review' }));
    await user.click(screen.getByRole('button', { name: 'createSubmit' }));
    expect(await screen.findByText('ineligibleTitle')).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: 'selectStudent ชื่อ2 สกุล2' }));
    expect(screen.queryByText('confirmTitle')).toBeNull();
    expect(screen.getByRole('button', { name: 'review' })).toHaveProperty('disabled', false);
  });
});
