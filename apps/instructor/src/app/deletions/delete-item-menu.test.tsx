import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionDeletionPreview } from '@/lib/instructor-collection-deletions-contract';

const actions = vi.hoisted(() => ({
  deleteCollectionItemAction: vi.fn(),
  previewCollectionDeletionAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    `${namespace}.${key}${values === undefined ? '' : `:${JSON.stringify(values)}`}`,
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@showcase/ui/toast', () => ({ toast }));
vi.mock('../collection-deletions.actions', () => actions);

import { DeleteItemMenu } from './delete-item-menu';

const GROUP_ID = '0b1f5a9e-6c1d-4f7a-8e2b-3c4d5e6f7a8b';
const ROUND_ID = '8d7f4c1e-2b6a-4f3d-9e5c-1a2b3c4d5e6f';
const DELETION_ID = '3c4d5e6f-7a8b-4c1d-9e2b-0b1f5a9e6c1d';
const NAME = 'CS67-1';

function preview(overrides: Partial<CollectionDeletionPreview> = {}): CollectionDeletionPreview {
  return {
    blockedReason: null,
    counts: { assignedStudentCount: 30, formCount: 2, groupCount: 0, submittedStudentCount: 12 },
    group: null,
    kind: 'group',
    name: NAME,
    round: { id: ROUND_ID, name: 'ชุดงานฝึกงาน' },
    ...overrides,
  };
}

function renderMenu(props: { isRoundClosed?: boolean; redirectTo?: string } = {}) {
  render(
    <DeleteItemMenu
      id={GROUP_ID}
      isRoundClosed={props.isRoundClosed ?? false}
      kind="group"
      name={NAME}
      {...(props.redirectTo === undefined ? {} : { redirectTo: props.redirectTo })}
    />,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: `Deletions.menu.label:{"name":"${NAME}"}` }));
  await user.click(await screen.findByRole('menuitem', { name: 'Deletions.menu.delete' }));
  return screen.findByRole('alertdialog');
}

function confirmInput(): HTMLInputElement {
  return screen.getByLabelText(`Deletions.dialog.confirmLabel:{"name":"${NAME}"}`);
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Deletions.dialog.confirm' });
}

describe('DeleteItemMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.previewCollectionDeletionAction.mockResolvedValue({ ok: true, preview: preview() });
  });

  afterEach(cleanup);

  it('reads the impact on opening and focuses cancel first', async () => {
    const user = userEvent.setup();
    renderMenu();

    await openDialog(user);

    expect(actions.previewCollectionDeletionAction).toHaveBeenCalledWith('group', GROUP_ID);
    expect(
      await screen.findByText('Deletions.dialog.impactGroup:{"formCount":2}', { exact: false }),
    ).toBeDefined();
    expect(screen.getByText('Deletions.dialog.inRound:{"round":"ชุดงานฝึกงาน"}')).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Deletions.dialog.cancel' }),
      ),
    );
  });

  it('enables delete only once the exact name is typed', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);
    await screen.findByLabelText(`Deletions.dialog.confirmLabel:{"name":"${NAME}"}`);

    expect(confirmButton().disabled).toBe(true);
    await user.type(confirmInput(), 'CS67');
    expect(confirmButton().disabled).toBe(true);
    await user.type(confirmInput(), '-1');
    expect(confirmButton().disabled).toBe(false);
  });

  it('keeps what was typed and says why when Core refuses', async () => {
    const user = userEvent.setup();
    actions.deleteCollectionItemAction.mockResolvedValue({
      deletionId: null,
      error: 'confirmationMismatch',
    });
    renderMenu();
    await openDialog(user);
    await user.type(
      await screen.findByLabelText(`Deletions.dialog.confirmLabel:{"name":"${NAME}"}`),
      NAME,
    );

    await user.click(confirmButton());

    expect(await screen.findByText('Deletions.errors.confirmationMismatch')).toBeDefined();
    expect(confirmInput().value).toBe(NAME);
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows progress while deleting, then refreshes the list with a link to the log', async () => {
    const user = userEvent.setup();
    let resolveDelete: (value: { deletionId: string; error: null }) => void = () => undefined;
    actions.deleteCollectionItemAction.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    renderMenu();
    await openDialog(user);
    await user.type(
      await screen.findByLabelText(`Deletions.dialog.confirmLabel:{"name":"${NAME}"}`),
      NAME,
    );

    await user.click(confirmButton());

    const pending = await screen.findByRole('button', { name: 'Deletions.dialog.deleting' });
    expect((pending as HTMLButtonElement).disabled).toBe(true);

    resolveDelete({ deletionId: DELETION_ID, error: null });

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
    expect(actions.deleteCollectionItemAction.mock.calls[0]?.slice(0, 2)).toEqual([
      'group',
      GROUP_ID,
    ]);
    const [message, options] = toast.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void }; duration: number },
    ];
    expect(message).toBe(`Deletions.dialog.success:{"name":"${NAME}"}`);
    expect(options.action.label).toBe('Deletions.dialog.viewLog');
    expect(options.duration).toBe(10_000);
    options.action.onClick();
    expect(router.push).toHaveBeenCalledWith('/deletions');
  });

  it('returns to the nearest live parent when its own page is open', async () => {
    const user = userEvent.setup();
    actions.deleteCollectionItemAction.mockResolvedValue({ deletionId: DELETION_ID, error: null });
    renderMenu({ redirectTo: `/rounds/${ROUND_ID}` });
    await openDialog(user);
    await user.type(
      await screen.findByLabelText(`Deletions.dialog.confirmLabel:{"name":"${NAME}"}`),
      NAME,
    );

    await user.click(confirmButton());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/rounds/${ROUND_ID}`));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('offers a retry when the impact cannot be read, but not for a missing item', async () => {
    const user = userEvent.setup();
    actions.previewCollectionDeletionAction.mockResolvedValueOnce({
      error: 'unavailable',
      ok: false,
    });
    actions.previewCollectionDeletionAction.mockResolvedValueOnce({
      error: 'notFound',
      ok: false,
    });
    renderMenu();
    await openDialog(user);

    await user.click(await screen.findByRole('button', { name: 'Deletions.dialog.retry' }));

    expect(await screen.findByText('Deletions.errors.notFound')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Deletions.dialog.retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deletions.dialog.confirm' })).toBeNull();
  });

  it('refuses in the dialog when Core reports the round closed', async () => {
    const user = userEvent.setup();
    actions.previewCollectionDeletionAction.mockResolvedValue({
      ok: true,
      preview: preview({ blockedReason: 'round_closed' }),
    });
    renderMenu();
    await openDialog(user);

    expect(await screen.findByText('Deletions.errors.roundClosed')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Deletions.dialog.confirm' })).toBeNull();
  });

  it('disables deletion in a closed round and explains why', async () => {
    const user = userEvent.setup();
    renderMenu({ isRoundClosed: true });

    await user.click(
      screen.getByRole('button', { name: `Deletions.menu.label:{"name":"${NAME}"}` }),
    );
    const item = await screen.findByRole('menuitem', { name: /Deletions\.menu\.delete/u });

    expect(item.getAttribute('aria-disabled')).toBe('true');
    const hintId = item.getAttribute('aria-describedby');
    expect(hintId).not.toBeNull();
    expect(document.getElementById(hintId ?? '')?.textContent).toBe(
      'Deletions.menu.roundClosedHint',
    );

    await user.click(item);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(actions.previewCollectionDeletionAction).not.toHaveBeenCalled();
  });
});
