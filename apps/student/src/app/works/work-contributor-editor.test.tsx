import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';

const PUBLIC_ID = '64000000-0000-4000-8000-000000000001';
const CANDIDATE_REFERENCE = '64000000-0000-4000-8000-000000000002';
const PUBLIC_PROFILE_ID = '64000000-0000-4000-8000-000000000003';
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
          publicProfile: {
            entryYear: 2566,
            hasPhoto: true,
            publicId: PUBLIC_PROFILE_ID,
          },
        },
        {
          candidateReference: '64000000-0000-4000-8000-000000000004',
          firstName: 'สมหญิง',
          lastName: 'รักดี',
          publicProfile: null,
        },
      ],
    });
    mocks.addAccount.mockResolvedValue({ contributors: [], outcome: 'added', version: 2 });
    mocks.addExternal.mockResolvedValue({ contributors: [], outcome: 'added', version: 2 });
  });

  afterEach(cleanup);

  afterEach(() => vi.useRealTimers());

  it('opens one Contributor flow for both roster candidates and entered external names', () => {
    renderEditor();

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'เพิ่มนักศึกษาหรือศิษย์เก่า' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'เพิ่มบุคคลภายนอก' })).toBeNull();

    openContributorEditor();

    expect(screen.getByRole('dialog', { name: 'เพิ่มผู้ร่วมผลงาน' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'ชื่อ นามสกุล หรือรหัสนักศึกษา' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeTruthy();
  });

  it('does not send a partial Student ID or create split name fields', async () => {
    vi.useFakeTimers();
    renderEditor();
    openContributorEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1234567' } });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.search).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('ชื่อ')).toBeNull();
    expect(screen.queryByLabelText('นามสกุล')).toBeNull();
  });

  it('shows consented profile context and a fallback avatar in the suggestion dropdown', async () => {
    renderEditor();
    openContributorEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'สม' } });

    const suggestions = await screen.findByRole('listbox', {
      name: 'รายชื่อผู้ร่วมผลงานที่แนะนำ',
    });
    expect(within(suggestions).getByText('ปีที่เข้า 2566')).toBeTruthy();
    const profileImage = within(suggestions).getByRole('img', {
      name: 'รูปโปรไฟล์ของ สมชาย ใจดี',
    });
    expect(profileImage.getAttribute('src')).toContain(`/people/${PUBLIC_PROFILE_ID}/photo`);
    expect(within(suggestions).getByTestId('contributor-avatar-fallback')).toBeTruthy();
    fireEvent.error(profileImage);
    expect(within(suggestions).getAllByTestId('contributor-avatar-fallback')).toHaveLength(2);
    expect(suggestions.textContent).not.toMatch(/[0-9]{8}/u);
  });

  it('locks a selected suggestion into a removable card and adds its opaque reference', async () => {
    renderEditor();
    openContributorEditor();
    const name = screen.getByRole('combobox', { name: 'ชื่อ นามสกุล หรือรหัสนักศึกษา' });
    fireEvent.change(name, { target: { value: 'สมชาย' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /สมชาย ใจดี/u }));

    const selectedCard = screen.getByTestId('selected-contributor-card');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(within(selectedCard).getByText('สมชาย ใจดี')).toBeTruthy();
    expect(within(selectedCard).getByText('ปีที่เข้า 2566')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('บทบาทที่มีต่อผลงาน'), {
      target: { value: 'พัฒนาระบบ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }));

    await waitFor(() =>
      expect(mocks.addAccount).toHaveBeenCalledWith(
        expect.objectContaining({ candidateReference: CANDIDATE_REFERENCE }),
      ),
    );
    expect(mocks.addExternal).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('creates an External Contributor from an entered name in the same flow', async () => {
    renderEditor();
    openContributorEditor();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Alex Example' },
    });
    fireEvent.change(screen.getByLabelText('บทบาทที่มีต่อผลงาน'), {
      target: { value: 'ออกแบบ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }));

    await waitFor(() =>
      expect(mocks.addExternal).toHaveBeenCalledWith(
        expect.objectContaining({ attributionName: 'Alex Example', contributionRole: 'ออกแบบ' }),
      ),
    );
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.addAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('removes a selected candidate card and returns to search', async () => {
    renderEditor();
    openContributorEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'สมชาย' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /สมชาย ใจดี/u }));
    fireEvent.change(screen.getByLabelText('บทบาทที่มีต่อผลงาน'), {
      target: { value: 'พัฒนาระบบ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'เอารายชื่อนี้ออก' }));

    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('บทบาทที่มีต่อผลงาน') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('selected-contributor-card')).toBeNull();
    expect(mocks.addAccount).not.toHaveBeenCalled();
    expect(mocks.addExternal).not.toHaveBeenCalled();
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

function openContributorEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }));
}
