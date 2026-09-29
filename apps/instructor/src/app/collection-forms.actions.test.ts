import { CoreClientError } from '@showcase/core-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  check: vi.fn(),
  clearToken: vi.fn(),
  fieldAnswers: vi.fn(),
  listSubmissions: vi.fn(),
  readToken: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect ${path}`);
  }),
  revalidatePath: vi.fn(),
  searchSubmissions: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: dependencies.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: dependencies.redirect }));
vi.mock('@/lib/server-environment', () => ({
  getInstructorServerEnvironment: () => ({
    coreUrl: 'https://core.test',
    instructorBffSecret: 'x'.repeat(32),
  }),
}));
vi.mock('@/lib/instructor-auth-session', () => ({
  clearInstructorSessionToken: dependencies.clearToken,
  readInstructorSessionToken: dependencies.readToken,
}));
vi.mock('@/lib/instructor-collection-forms-core', () => ({
  InstructorCollectionFormsCoreClient: class {
    check = dependencies.check;
    fieldAnswers = dependencies.fieldAnswers;
    listSubmissions = dependencies.listSubmissions;
    searchSubmissions = dependencies.searchSubmissions;
  },
}));

import {
  checkCollectionSubmissionAction,
  readFieldAnswersAction,
  readReviewQueueAction,
} from './collection-forms.actions';
import { INITIAL_FORM_ACTION_STATE } from './collection-forms-state';

const GROUP_ID = '20000000-0000-4000-8000-000000000001';
const FORM_ID = '30000000-0000-4000-8000-000000000001';
const STUDENT = '40000000-0000-4000-8000-000000000001';
const PAGE = { items: [{ value: 'ยาว' }], kind: 'texts', nextCursor: null };

describe('readFieldAnswersAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('session');
    dependencies.fieldAnswers.mockResolvedValue(PAGE);
  });

  it('reads the next page for the question and cursor asked for', async () => {
    await expect(
      readFieldAnswersAction(FORM_ID, 'reflection', 'summary', 'bzoxMA'),
    ).resolves.toEqual({ ok: true, page: PAGE });
    expect(dependencies.fieldAnswers).toHaveBeenCalledWith('session', FORM_ID, 'reflection', {
      cursor: 'bzoxMA',
      mode: 'summary',
    });
  });

  it.each([
    ['a form id that is not one', ['../groups', 'reflection', 'summary', 'bzoxMA']],
    ['a field id Core never issues', [FORM_ID, 'bad id', 'summary', 'bzoxMA']],
    ['an unknown mode', [FORM_ID, 'reflection', 'individual', 'bzoxMA']],
    ['a cursor Core never issues', [FORM_ID, 'reflection', 'summary', 'o:10']],
  ])('refuses %s without calling Core', async (_case, args) => {
    const [formId, fieldId, mode, cursor] = args as [string, string, 'summary', string];

    await expect(readFieldAnswersAction(formId, fieldId, mode, cursor)).resolves.toEqual({
      ok: false,
    });
    expect(dependencies.fieldAnswers).not.toHaveBeenCalled();
  });

  it('returns a failure the list can retry, keeping what it loaded', async () => {
    dependencies.fieldAnswers.mockRejectedValue(new CoreClientError('SERVICE_UNAVAILABLE', 503));

    await expect(
      readFieldAnswersAction(FORM_ID, 'reflection', 'summary', 'bzoxMA'),
    ).resolves.toEqual({ ok: false });
  });

  it('sends an expired session back to sign in', async () => {
    dependencies.fieldAnswers.mockRejectedValue(new CoreClientError('SESSION_EXPIRED', 401));

    await expect(
      readFieldAnswersAction(FORM_ID, 'reflection', 'summary', 'bzoxMA'),
    ).rejects.toThrow('redirect /?expired=1');
    expect(dependencies.clearToken).toHaveBeenCalled();
  });
});

describe('readReviewQueueAction', () => {
  const QUERY = { page: 2, pageSize: 25, search: '', sort: 'name', status: 'passed' } as const;
  const QUEUE_PAGE = {
    entries: [],
    page: 2,
    statusCounts: {
      awaiting_checking: 0,
      changes_required: 0,
      not_submitted: 0,
      passed: 26,
      withdrawn: 0,
    },
    total: 26,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('session');
    dependencies.listSubmissions.mockResolvedValue({ ...QUEUE_PAGE, form: { id: FORM_ID } });
    dependencies.searchSubmissions.mockResolvedValue({ ...QUEUE_PAGE, form: { id: FORM_ID } });
  });

  it('reads a page without a search as a plain read, and leaves the form out', async () => {
    await expect(readReviewQueueAction(FORM_ID, QUERY)).resolves.toEqual({
      ok: true,
      queue: QUEUE_PAGE,
    });
    expect(dependencies.listSubmissions).toHaveBeenCalledWith('session', FORM_ID, {
      page: 2,
      pageSize: 25,
      sort: 'name',
      status: 'passed',
    });
    expect(dependencies.searchSubmissions).not.toHaveBeenCalled();
  });

  it('sends a trimmed search through the search read', async () => {
    await readReviewQueueAction(FORM_ID, { ...QUERY, search: ' 6600 ', status: null });

    expect(dependencies.searchSubmissions).toHaveBeenCalledWith('session', FORM_ID, {
      page: 2,
      pageSize: 25,
      search: '6600',
      sort: 'name',
      status: null,
    });
    expect(dependencies.listSubmissions).not.toHaveBeenCalled();
  });

  it.each([
    ['a form id that is not one', '../groups', QUERY],
    ['a page below one', FORM_ID, { ...QUERY, page: 0 }],
    ['a page size Core refuses', FORM_ID, { ...QUERY, pageSize: 500 }],
    ['an unknown order', FORM_ID, { ...QUERY, sort: 'random' }],
    ['an unknown status', FORM_ID, { ...QUERY, status: 'all' }],
    ['a search beyond the bound', FORM_ID, { ...QUERY, search: 'ก'.repeat(101) }],
  ])('refuses %s without calling Core', async (_case, formId, query) => {
    await expect(
      readReviewQueueAction(formId, query as Parameters<typeof readReviewQueueAction>[1]),
    ).resolves.toEqual({ ok: false });
    expect(dependencies.listSubmissions).not.toHaveBeenCalled();
    expect(dependencies.searchSubmissions).not.toHaveBeenCalled();
  });

  it('returns a failure the table can retry', async () => {
    dependencies.listSubmissions.mockRejectedValue(new CoreClientError('SERVICE_UNAVAILABLE', 503));

    await expect(readReviewQueueAction(FORM_ID, QUERY)).resolves.toEqual({ ok: false });
  });

  it('sends an expired session back to sign in', async () => {
    dependencies.listSubmissions.mockRejectedValue(new CoreClientError('SESSION_EXPIRED', 401));

    await expect(readReviewQueueAction(FORM_ID, QUERY)).rejects.toThrow('redirect /?expired=1');
    expect(dependencies.clearToken).toHaveBeenCalled();
  });
});

describe('checkCollectionSubmissionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('session');
    dependencies.check.mockResolvedValue({ status: 'passed' });
  });

  it('refreshes both the index and the Student page after a decision', async () => {
    const formData = new FormData();
    formData.set('decision', 'passed');
    formData.set('reason', '');
    formData.set('submissionId', '50000000-0000-4000-8000-000000000001');

    await expect(
      checkCollectionSubmissionAction(
        GROUP_ID,
        FORM_ID,
        STUDENT,
        INITIAL_FORM_ACTION_STATE,
        formData,
      ),
    ).resolves.toMatchObject({ error: null, submitted: true });
    expect(dependencies.revalidatePath).toHaveBeenCalledWith(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions`,
    );
    expect(dependencies.revalidatePath).toHaveBeenCalledWith(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/students/${STUDENT}`,
    );
  });
});
