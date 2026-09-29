import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CollectionDeletionLogEntry,
  CollectionDeletionLogPage,
} from '@/lib/instructor-collection-deletions-contract';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    `${namespace}.${key}${values === undefined ? '' : `:${JSON.stringify(values)}`}`,
}));
vi.mock('@showcase/ui/toast', () => ({ toast }));

import { DeletionLog } from './deletion-log';

const FIRST_ID = '0b1f5a9e-6c1d-4f7a-8e2b-3c4d5e6f7a8b';
const SECOND_ID = '8d7f4c1e-2b6a-4f3d-9e5c-1a2b3c4d5e6f';
const THIRD_ID = '3c4d5e6f-7a8b-4c1d-9e2b-0b1f5a9e6c1d';

function entry(overrides: Partial<CollectionDeletionLogEntry> = {}): CollectionDeletionLogEntry {
  return {
    counts: { assignedStudentCount: 30, formCount: 1, groupCount: 0, submittedStudentCount: 12 },
    deletedAt: '2026-09-29T03:00:00.000Z',
    deletedByName: 'อาจารย์สมศรี',
    groupName: 'CS67-1',
    id: FIRST_ID,
    kind: 'form',
    name: 'เอกสารฝึกงาน',
    restore: null,
    restoreAvailability: { status: 'available' },
    roundName: 'ชุดงานฝึกงาน',
    ...overrides,
  };
}

function page(
  entries: CollectionDeletionLogEntry[],
  nextCursor: string | null = null,
): CollectionDeletionLogPage {
  return { entries, nextCursor };
}

function restoreButton(name: string): HTMLElement {
  return screen.getByRole('button', { name: `Deletions.restore.actionLabel:{"name":"${name}"}` });
}

const readPage = vi.fn();
const restoreAction = vi.fn();

function renderLog(initialPage: CollectionDeletionLogPage) {
  render(
    <DeletionLog initialPage={initialPage} readPage={readPage} restoreAction={restoreAction} />,
  );
}

describe('DeletionLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('says so when nothing has been deleted', () => {
    renderLog(page([]));

    expect(screen.getByText('Deletions.log.empty')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows what was deleted, by whom and when in Bangkok time, and any restore', () => {
    renderLog(
      page([
        entry({
          restore: {
            reason: 'ลบผิดกลุ่ม',
            restoredAt: '2026-09-29T05:30:00.000Z',
            restoredByName: '',
          },
          restoreAvailability: { status: 'already_restored' },
        }),
      ]),
    );

    const item = within(screen.getByRole('list', { name: 'Deletions.log.listLabel' })).getByRole(
      'listitem',
    );
    expect(
      within(item).getByText(
        'Deletions.log.entryForm:{"group":"CS67-1","name":"เอกสารฝึกงาน","round":"ชุดงานฝึกงาน"}',
      ),
    ).toBeDefined();
    expect(
      within(item).getByText(/Deletions\.log\.deletedBy:.*อาจารย์สมศรี.*10:00/u),
    ).toBeDefined();
    expect(within(item).getByText('Deletions.log.restored')).toBeDefined();
    expect(
      within(item).getByText(/Deletions\.log\.restoredBy:.*Deletions\.log\.unknownActor.*12:30/u),
    ).toBeDefined();
    expect(
      within(item).getByText('Deletions.log.restoreReason:{"reason":"ลบผิดกลุ่ม"}'),
    ).toBeDefined();
    expect(within(item).queryByRole('button')).toBeNull();
  });

  it('explains why a restore is unavailable on a disabled but focusable action', () => {
    renderLog(
      page([
        entry({
          restoreAvailability: {
            ancestorKind: 'group',
            ancestorName: 'CS67-1',
            status: 'ancestor_deleted',
          },
        }),
        entry({
          id: SECOND_ID,
          kind: 'round',
          name: 'ชุดงานเก่า',
          restoreAvailability: { status: 'round_closed' },
        }),
      ]),
    );

    const blocked = restoreButton('เอกสารฝึกงาน');
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(blocked.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Deletions.restore.unavailableGroup:{"name":"CS67-1"}');
    const closed = restoreButton('ชุดงานเก่า');
    expect(
      document.getElementById(closed.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Deletions.restore.unavailableRoundClosed');
  });

  it('reads the next page and appends it', async () => {
    const user = userEvent.setup();
    readPage.mockResolvedValue({
      ok: true,
      page: page([entry({ id: SECOND_ID, kind: 'round', name: 'ชุดงานเก่า' })]),
    });
    renderLog(page([entry()], 'cursor-1'));

    await user.click(screen.getByRole('button', { name: 'Deletions.log.loadMore' }));

    expect(readPage).toHaveBeenCalledWith('cursor-1');
    expect(await screen.findByText('Deletions.log.entryRound:{"name":"ชุดงานเก่า"}')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Deletions.log.loadMore' })).toBeNull();
  });

  it('keeps the listed entries and offers a retry when the next page fails', async () => {
    const user = userEvent.setup();
    readPage.mockResolvedValue({ ok: false });
    renderLog(page([entry()], 'cursor-1'));

    await user.click(screen.getByRole('button', { name: 'Deletions.log.loadMore' }));

    expect(await screen.findByText('Deletions.log.loadMoreFailed')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Deletions.log.retry' })).toBeDefined();
  });

  it('restores with a reason, confirms, and reads the first page again', async () => {
    const user = userEvent.setup();
    restoreAction.mockResolvedValue({ ancestor: null, error: null, isRestored: true });
    readPage.mockResolvedValue({
      ok: true,
      page: page([entry({ id: THIRD_ID, restoreAvailability: { status: 'already_restored' } })]),
    });
    renderLog(page([entry()]));

    await user.click(restoreButton('เอกสารฝึกงาน'));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Deletions.restore.confirm' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText('Deletions.restore.reasonLabel'), 'ลบผิดกลุ่ม');
    await user.click(confirm);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Deletions.restore.success:{"name":"เอกสารฝึกงาน"}',
      ),
    );
    const [deletionId, , formData] = restoreAction.mock.calls[0] as [string, unknown, FormData];
    expect(deletionId).toBe(FIRST_ID);
    expect(formData.get('reason')).toBe('ลบผิดกลุ่ม');
    expect(readPage).toHaveBeenCalledWith(null);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByRole('button', { name: /Deletions\.restore\.actionLabel/u })).toBeNull();
  });

  it('keeps the reason and names the deleted ancestor when Core refuses a restore', async () => {
    const user = userEvent.setup();
    restoreAction.mockResolvedValue({
      ancestor: { kind: 'round', name: 'ชุดงานฝึกงาน' },
      error: 'ancestorDeleted',
      isRestored: false,
    });
    renderLog(page([entry()]));

    await user.click(restoreButton('เอกสารฝึกงาน'));
    const dialog = await screen.findByRole('alertdialog');
    const reason = within(dialog).getByLabelText('Deletions.restore.reasonLabel');
    await user.type(reason, 'ลบผิดกลุ่ม');
    await user.click(within(dialog).getByRole('button', { name: 'Deletions.restore.confirm' }));

    expect(
      await within(dialog).findByText('Deletions.restore.unavailableRound:{"name":"ชุดงานฝึกงาน"}'),
    ).toBeDefined();
    expect((reason as HTMLTextAreaElement).value).toBe('ลบผิดกลุ่ม');
    expect(toast.success).not.toHaveBeenCalled();
    expect(readPage).not.toHaveBeenCalled();
  });
});
