import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstructorReviewEntry } from '@/lib/instructor-collection-forms-contract';
import { ReviewQueue } from './review-queue';

vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString() }),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function entry(index: number, status: InstructorReviewEntry['status']): InstructorReviewEntry {
  const submittedAt = status === 'not_submitted' ? null : '2026-09-01T02:00:00.000Z';
  return {
    firstSubmittedAt: submittedAt,
    isLate: false,
    latestCheckingReason: null,
    latestSubmission:
      submittedAt === null
        ? null
        : {
            answers: {},
            fields: [],
            files: {},
            formVersion: 1,
            id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            submittedAt,
            version: 1,
          },
    rosterName: { firstNameTh: `ชื่อ${String(index).padStart(2, '0')}`, lastNameTh: 'สกุล' },
    status,
    studentAccountId: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    studentId: String(66000000 + index),
  };
}

/* Twelve waiting for review and three not yet submitted: two pages at ten per page. */
const ENTRIES = [
  ...Array.from({ length: 12 }, (_, index) => entry(index + 1, 'awaiting_checking')),
  ...Array.from({ length: 3 }, (_, index) => entry(index + 20, 'not_submitted')),
];

function renderQueue() {
  render(
    <ReviewQueue
      checkAction={vi.fn()}
      entries={ENTRIES}
      formId="30000000-0000-4000-8000-000000000001"
      groupId="20000000-0000-4000-8000-000000000001"
    />,
  );
}

function bodyRows(): HTMLElement[] {
  const [, body] = screen.getAllByRole('rowgroup');
  return within(body!).getAllByRole('row');
}

afterEach(cleanup);

describe('ReviewQueue', () => {
  it('pages the entries and says which range is shown', async () => {
    const user = userEvent.setup();
    renderQueue();

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('review.resultCount 1 10 15')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'review.pageLabel 2' }));

    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByText('review.resultCount 11 15 15')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'review.pageLabel 2' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('filters by status tab and narrows by name, starting again from page one', async () => {
    const user = userEvent.setup();
    renderQueue();
    await user.click(screen.getByRole('button', { name: 'review.pageLabel 2' }));

    await user.click(screen.getByRole('button', { name: /^obligationStatus\.not_submitted/u }));
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('review.resultCount 1 3 3')).toBeTruthy();

    await user.type(screen.getByLabelText('review.searchLabel'), 'ชื่อ21');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('ชื่อ21 สกุล')).toBeTruthy();
  });

  it('shows each Student ID and finds a Student by it', async () => {
    const user = userEvent.setup();
    renderQueue();
    expect(screen.getByRole('columnheader', { name: 'review.columnStudentId' })).toBeTruthy();

    await user.type(screen.getByLabelText('review.searchLabel'), '66000012');

    const [row] = bodyRows();
    expect(bodyRows()).toHaveLength(1);
    expect(within(row!).getByText('66000012')).toBeTruthy();
    expect(within(row!).getAllByText('ชื่อ12 สกุล')).not.toHaveLength(0);
  });

  it('hides the history action when it is switched off in the display menu', async () => {
    const user = userEvent.setup();
    renderQueue();
    expect(screen.getAllByText('history.openAction')).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'review.displayMenu' }));
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'review.showHistoryAction' }),
    );

    expect(screen.queryAllByText('history.openAction')).toHaveLength(0);
    expect(screen.getAllByText('review.openAction')).toHaveLength(10);
  });
});
