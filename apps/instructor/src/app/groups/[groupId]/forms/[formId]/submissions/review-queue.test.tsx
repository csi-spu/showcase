import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InstructorReviewEntry,
  InstructorReviewOrder,
  InstructorReviewQueuePage,
  ReviewQueueReadResult,
} from '@/lib/instructor-collection-forms-contract';
import { DEFAULT_INDIVIDUAL_QUERY, type IndividualQuery } from './responses-query';
import { ReviewQueue } from './review-queue';
import { REVIEW_STATUS_ORDER } from './review-queue-view';

vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString() }),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const readReviewQueue = vi.hoisted(() => vi.fn());
vi.mock('@/app/collection-forms.actions', () => ({ readReviewQueueAction: readReviewQueue }));

const GROUP_ID = '20000000-0000-4000-8000-000000000001';
const FORM_ID = '30000000-0000-4000-8000-000000000001';
const BASE = `/groups/${GROUP_ID}/forms/${FORM_ID}`;

type ReadQuery = InstructorReviewOrder & { page: number; search: string };

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

/*
 * Stands in for Core: searches, filters and pages ENTRIES, which are already
 * in status-then-name order. Core's own ordering is tested in Core.
 */
function corePage(query: Omit<ReadQuery, 'sort'>): InstructorReviewQueuePage {
  const matching = ENTRIES.filter(
    (candidate) =>
      query.search === '' ||
      candidate.studentId?.startsWith(query.search) === true ||
      candidate.rosterName.firstNameTh.includes(query.search),
  );
  const statusCounts = Object.fromEntries(
    REVIEW_STATUS_ORDER.map((status) => [
      status,
      matching.filter((candidate) => candidate.status === status).length,
    ]),
  ) as InstructorReviewQueuePage['statusCounts'];
  const listed =
    query.status === null
      ? matching
      : matching.filter((candidate) => candidate.status === query.status);
  const page = Math.min(query.page, Math.max(1, Math.ceil(listed.length / query.pageSize)));
  const start = (page - 1) * query.pageSize;
  return {
    entries: listed.slice(start, start + query.pageSize),
    page,
    statusCounts,
    total: listed.length,
  };
}

function renderQueue(
  initialQuery: IndividualQuery = DEFAULT_INDIVIDUAL_QUERY,
  initialQueue: InstructorReviewQueuePage = corePage({
    page: initialQuery.page,
    pageSize: initialQuery.pageSize,
    search: '',
    status: initialQuery.status === 'all' ? null : initialQuery.status,
  }),
) {
  render(
    <ReviewQueue
      formId={FORM_ID}
      groupId={GROUP_ID}
      initialQuery={initialQuery}
      initialQueue={initialQueue}
    />,
  );
}

/* Every URL the queue has written, most recent last. */
function writtenUrls(): string[] {
  return vi.mocked(window.history.replaceState).mock.calls.map(([, , url]) => String(url));
}

function bodyRows(): HTMLElement[] {
  const [, body] = screen.getAllByRole('rowgroup');
  return within(body!).getAllByRole('row');
}

function lastRead(): ReadQuery {
  return readReviewQueue.mock.calls.at(-1)?.[1] as ReadQuery;
}

beforeEach(() => {
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
  readReviewQueue.mockImplementation(
    async (_formId: string, query: ReadQuery): Promise<ReviewQueueReadResult> => ({
      ok: true,
      queue: corePage(query),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  readReviewQueue.mockReset();
  push.mockReset();
});

describe('ReviewQueue', () => {
  it('shows the page the server read without asking Core again', () => {
    renderQueue();

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('review.resultCount 1 10 15')).toBeTruthy();
    expect(readReviewQueue).not.toHaveBeenCalled();
  });

  it('reads another page from Core and says which range is shown', async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole('button', { name: 'review.pageLabel 2' }));

    await waitFor(() => expect(bodyRows()).toHaveLength(5));
    expect(readReviewQueue).toHaveBeenCalledWith(FORM_ID, {
      page: 2,
      pageSize: 10,
      search: '',
      sort: 'status',
      status: null,
    });
    expect(screen.getByText('review.resultCount 11 15 15')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'review.pageLabel 2' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('filters by status tab with the counts Core returned, starting again from page one', async () => {
    const user = userEvent.setup();
    renderQueue({ ...DEFAULT_INDIVIDUAL_QUERY, page: 2 });

    await user.click(screen.getByRole('button', { name: /^obligationStatus\.not_submitted/u }));

    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(lastRead()).toMatchObject({ page: 1, status: 'not_submitted' });
    expect(screen.getByText('review.resultCount 1 3 3')).toBeTruthy();
  });

  it('searches through Core by Student ID and keeps the term out of the URL', async () => {
    const user = userEvent.setup();
    renderQueue({ ...DEFAULT_INDIVIDUAL_QUERY, page: 2 });

    await user.type(screen.getByLabelText('review.searchLabel'), '66000012');

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(lastRead()).toMatchObject({ page: 1, search: '66000012' });
    expect(within(bodyRows()[0]!).getByText('66000012')).toBeTruthy();
    expect(writtenUrls().some((url) => url.includes('66000012'))).toBe(false);
    /* The return to page one is kept, so the URL never names a page the table left. */
    expect(writtenUrls().at(-1)).toBe(`${BASE}/submissions`);
    /* The search waits for typing to pause rather than reading on every key. */
    expect(readReviewQueue.mock.calls.length).toBeLessThan('66000012'.length);
  });

  it('keeps status, order, page and page size in the URL', async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole('button', { name: 'review.pageLabel 2' }));
    expect(writtenUrls().at(-1)).toBe(`${BASE}/submissions?page=2`);

    await user.selectOptions(screen.getByLabelText('review.pageSizeLabel'), '25');
    expect(writtenUrls().at(-1)).toBe(`${BASE}/submissions?pageSize=25`);
    await waitFor(() => expect(bodyRows()).toHaveLength(15));

    await user.click(screen.getByRole('button', { name: /^obligationStatus\.not_submitted/u }));
    expect(writtenUrls().at(-1)).toBe(`${BASE}/submissions?status=not_submitted&pageSize=25`);
  });

  it('shows only the latest read when an older one answers late', async () => {
    const user = userEvent.setup();
    let answerFirst: (result: ReviewQueueReadResult) => void = () => undefined;
    readReviewQueue.mockImplementationOnce(
      () =>
        new Promise<ReviewQueueReadResult>((resolve) => {
          answerFirst = resolve;
        }),
    );
    renderQueue();

    await user.click(screen.getByRole('button', { name: 'review.pageLabel 2' }));
    await user.click(screen.getByRole('button', { name: /^obligationStatus\.not_submitted/u }));
    await waitFor(() => expect(bodyRows()).toHaveLength(3));

    await act(async () => {
      answerFirst({
        ok: true,
        queue: corePage({ page: 2, pageSize: 10, search: '', status: null }),
      });
    });
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('review.resultCount 1 3 3')).toBeTruthy();
  });

  it('keeps the rows it shows when a read fails, and retries', async () => {
    const user = userEvent.setup();
    readReviewQueue.mockResolvedValueOnce({ ok: false });
    renderQueue();

    await user.click(screen.getByRole('button', { name: 'review.pageLabel 2' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('review.loadFailed');
    expect(bodyRows()).toHaveLength(10);

    await user.click(within(alert).getByRole('button', { name: 'review.retry' }));

    await waitFor(() => expect(bodyRows()).toHaveLength(5));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens a Student page that keeps the filter, order and page size, from the row or its action', async () => {
    const user = userEvent.setup();
    renderQueue({ page: 1, pageSize: 25, sort: 'name', status: 'awaiting_checking' });
    const [row] = bodyRows();
    const studentPage = `${BASE}/students/40000000-0000-4000-8000-000000000001?status=awaiting_checking&sort=name&pageSize=25`;

    expect(
      within(row!)
        .getByRole('link', { name: 'review.openActionLabel ชื่อ01 สกุล' })
        .getAttribute('href'),
    ).toBe(studentPage);
    expect(screen.queryByText('history.openAction')).toBeNull();

    await user.click(within(row!).getByText('66000001'));
    expect(push).toHaveBeenCalledWith(studentPage);
  });

  it('links nothing for a Student who has not submitted', () => {
    renderQueue({ ...DEFAULT_INDIVIDUAL_QUERY, status: 'not_submitted' });
    const [row] = bodyRows();

    expect(within(row!).queryByRole('link', { name: /^review\.openActionLabel/u })).toBeNull();
    expect(within(row!).getByText('review.noSubmissionAction')).toBeTruthy();
  });

  it('clears a search that found nobody back to every Student', async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.type(screen.getByLabelText('review.searchLabel'), 'ไม่มีใคร');
    const clear = await screen.findByRole('button', { name: 'review.clearFilters' });

    await user.click(clear);

    await waitFor(() => expect(bodyRows()).toHaveLength(10));
    expect(lastRead()).toMatchObject({ page: 1, search: '', status: null });
    expect((screen.getByLabelText('review.searchLabel') as HTMLInputElement).value).toBe('');
  });

  it('says the form has no Students when nobody is assigned', () => {
    renderQueue(DEFAULT_INDIVIDUAL_QUERY, {
      entries: [],
      page: 1,
      statusCounts: {
        awaiting_checking: 0,
        changes_required: 0,
        not_submitted: 0,
        passed: 0,
        withdrawn: 0,
      },
      total: 0,
    });

    expect(screen.getByText('review.empty')).toBeTruthy();
  });
});
