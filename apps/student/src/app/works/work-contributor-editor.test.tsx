import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';

const PUBLIC_ID = '64000000-0000-4000-8000-000000000001';
const CANDIDATE_REFERENCE = '64000000-0000-4000-8000-000000000002';
const mocks = vi.hoisted(() => ({
  addAccount: vi.fn(),
  addExternal: vi.fn(),
  remove: vi.fn(),
  search: vi.fn(),
}));

vi.mock('./work.actions', () => ({
  addAccountContributorAction: mocks.addAccount,
  addExternalContributorAction: mocks.addExternal,
  removeContributorAction: mocks.remove,
  searchContributorCandidatesAction: mocks.search,
}));

import { WorkContributorEditor } from './work-contributor-editor';

describe('WorkContributorEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue({
      candidates: [
        {
          candidateReference: CANDIDATE_REFERENCE,
          firstName: 'สมชาย',
          lastName: 'ใจดี',
        },
      ],
    });
    mocks.addAccount.mockResolvedValue({ contributors: [], outcome: 'added', version: 2 });
    mocks.addExternal.mockResolvedValue({ contributors: [], outcome: 'added', version: 2 });
  });

  afterEach(cleanup);

  afterEach(() => vi.useRealTimers());

  it('does not send a partial Student ID or create split name fields', async () => {
    vi.useFakeTimers();
    renderEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1234567' } });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.search).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('ชื่อ')).toBeNull();
    expect(screen.queryByLabelText('นามสกุล')).toBeNull();
  });

  it('selects a name suggestion and adds its opaque candidate reference', async () => {
    renderEditor();
    const name = screen.getByRole('combobox', { name: 'ชื่อ นามสกุล หรือรหัสนักศึกษา' });
    fireEvent.change(name, { target: { value: 'สมชาย' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: 'สมชาย ใจดี' }));
    fireEvent.change(screen.getByLabelText('บทบาทที่มีต่อผลงาน'), {
      target: { value: 'พัฒนาระบบ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }));

    expect(mocks.addAccount).toHaveBeenCalledWith(
      expect.objectContaining({ candidateReference: CANDIDATE_REFERENCE }),
    );
    expect(mocks.addExternal).not.toHaveBeenCalled();
  });

  it('creates an External Contributor when a full name has no selected reference', async () => {
    mocks.search.mockResolvedValue({ candidates: [] });
    renderEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Alex Example' } });
    fireEvent.change(screen.getByLabelText('บทบาทที่มีต่อผลงาน'), {
      target: { value: 'ออกแบบ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }));

    expect(mocks.addExternal).toHaveBeenCalledWith(
      expect.objectContaining({ attributionName: 'Alex Example', contributionRole: 'ออกแบบ' }),
    );
    expect(mocks.addAccount).not.toHaveBeenCalled();
  });

  it('clears a selected reference when the full name is edited', async () => {
    renderEditor();
    const name = screen.getByRole('combobox');
    fireEvent.change(name, { target: { value: '12345678' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: 'สมชาย ใจดี' }));
    expect((name as HTMLInputElement).value).toBe('สมชาย ใจดี');
    expect(screen.queryByDisplayValue('12345678')).toBeNull();

    fireEvent.change(name, { target: { value: 'สมชาย ใจดี เพิ่มเติม' } });
    fireEvent.change(screen.getByLabelText('บทบาทที่มีต่อผลงาน'), {
      target: { value: 'ทดสอบ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }));

    expect(mocks.addExternal).toHaveBeenCalledWith(
      expect.objectContaining({ attributionName: 'สมชาย ใจดี เพิ่มเติม' }),
    );
  });
});

function renderEditor() {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <WorkContributorEditor
        contributors={[]}
        onContributors={vi.fn()}
        onVersion={vi.fn()}
        publicId={PUBLIC_ID}
        version={1}
      />
    </NextIntlClientProvider>,
  );
}
