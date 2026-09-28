import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FormHistoryReadResult,
  InstructorFormHistoryEntry,
} from '@/lib/instructor-collection-forms-contract';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, number | string>) =>
    `${namespace}.${key}${values === undefined ? '' : `:${JSON.stringify(values)}`}`,
}));

import { FormEditHistory } from './form-edit-history';

const SAVE: InstructorFormHistoryEntry = {
  actorName: 'สมชาย ใจดี',
  changes: [
    { kind: 'title_changed', next: 'B', previous: 'A' },
    { isRequired: false, kind: 'question_required_changed', label: 'บริษัท' },
    { kind: 'deadline_changed', next: '2026-10-10T03:00:00.000Z', previous: null },
  ],
  id: '58000000-0000-4000-8000-000000000001',
  occurredAt: '2026-09-29T03:00:00.000Z',
};
const OPENED: InstructorFormHistoryEntry = {
  actorName: '',
  changes: [{ assignedCount: 12, kind: 'opened' }],
  id: '58000000-0000-4000-8000-000000000002',
  occurredAt: '2026-09-28T03:00:00.000Z',
};
const EMPTY_SAVE: InstructorFormHistoryEntry = {
  actorName: 'สมหญิง รักเรียน',
  changes: [],
  id: '58000000-0000-4000-8000-000000000003',
  occurredAt: '2026-09-27T03:00:00.000Z',
};

function page(
  entries: InstructorFormHistoryEntry[],
  nextCursor: string | null = null,
): FormHistoryReadResult {
  return { ok: true, page: { entries, nextCursor } };
}

const BANGKOK = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

async function openPanel(readHistory: (cursor: string | null) => Promise<FormHistoryReadResult>) {
  const user = userEvent.setup();
  render(<FormEditHistory readHistory={readHistory} />);
  await user.click(screen.getByRole('button', { name: 'Forms.editHistory.action' }));
  return user;
}

describe('FormEditHistory', () => {
  afterEach(() => cleanup());

  it('reads nothing until the Instructor opens the panel', () => {
    const readHistory = vi.fn(async () => page([]));
    render(<FormEditHistory readHistory={readHistory} />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readHistory).not.toHaveBeenCalled();
  });

  it('lists who changed what and when, in Bangkok time', async () => {
    const readHistory = vi.fn(async () => page([SAVE, OPENED, EMPTY_SAVE]));
    await openPanel(readHistory);

    expect(readHistory).toHaveBeenCalledWith(null);
    expect(await screen.findByText('สมชาย ใจดี')).toBeDefined();
    expect(
      screen.getByText(BANGKOK.format(new Date(SAVE.occurredAt))).getAttribute('datetime'),
    ).toBe(SAVE.occurredAt);
    expect(
      screen.getByText('Forms.editHistory.change.titleChanged:{"next":"B","previous":"A"}'),
    ).toBeDefined();
    expect(
      screen.getByText('Forms.editHistory.change.questionOptional:{"label":"บริษัท"}'),
    ).toBeDefined();
    expect(
      screen.getByText(
        `Forms.editHistory.change.deadlineChanged:${JSON.stringify({
          next: BANGKOK.format(new Date('2026-10-10T03:00:00.000Z')),
          previous: 'Forms.editHistory.noDeadline',
        })}`,
      ),
    ).toBeDefined();
    expect(screen.getByText('Forms.editHistory.unknownActor')).toBeDefined();
    expect(screen.getByText('Forms.editHistory.change.opened:{"count":12}')).toBeDefined();
    expect(screen.getByText('Forms.editHistory.noChanges')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Forms.editHistory.loadMore' })).toBeNull();
  });

  it('shows an empty state when the form has no history', async () => {
    await openPanel(vi.fn(async () => page([])));

    expect(await screen.findByText('Forms.editHistory.empty')).toBeDefined();
  });

  it('appends the next page from the cursor', async () => {
    const readHistory = vi.fn(async (cursor: string | null) =>
      cursor === null ? page([SAVE], 'next-page') : page([OPENED]),
    );
    const user = await openPanel(readHistory);

    await user.click(await screen.findByRole('button', { name: 'Forms.editHistory.loadMore' }));

    expect(readHistory).toHaveBeenLastCalledWith('next-page');
    expect(await screen.findByText('Forms.editHistory.change.opened:{"count":12}')).toBeDefined();
    expect(screen.getByText('สมชาย ใจดี')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Forms.editHistory.loadMore' })).toBeNull();
  });

  it('keeps loaded entries and offers a retry when the next page fails', async () => {
    const readHistory = vi
      .fn<(cursor: string | null) => Promise<FormHistoryReadResult>>()
      .mockResolvedValueOnce(page([SAVE], 'next-page'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(page([OPENED]));
    const user = await openPanel(readHistory);

    await user.click(await screen.findByRole('button', { name: 'Forms.editHistory.loadMore' }));
    expect(await screen.findByText('Forms.editHistory.loadMoreFailed')).toBeDefined();
    expect(screen.getByText('สมชาย ใจดี')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Forms.editHistory.retry' }));

    expect(readHistory).toHaveBeenLastCalledWith('next-page');
    expect(await screen.findByText('Forms.editHistory.change.opened:{"count":12}')).toBeDefined();
  });

  it('shows an error with a retry when Core cannot serve the history', async () => {
    const readHistory = vi
      .fn<(cursor: string | null) => Promise<FormHistoryReadResult>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(page([SAVE]));
    const user = await openPanel(readHistory);

    expect(await screen.findByText('Forms.editHistory.loadFailed')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Forms.editHistory.retry' }));

    expect(await screen.findByText('สมชาย ใจดี')).toBeDefined();
    expect(readHistory).toHaveBeenCalledTimes(2);
    expect(readHistory).toHaveBeenLastCalledWith(null);
  });
});
