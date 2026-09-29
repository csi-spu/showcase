import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoundList } from './round-list';
import { ROUND_PAGE_SIZE, type RoundListItem } from './round-list-view';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));
vi.mock('../deletions/delete-item-menu', () => ({
  DeleteItemMenu: ({ isRoundClosed, name }: { isRoundClosed: boolean; name: string }) => (
    <button type="button">{`delete ${name} ${isRoundClosed ? 'closed' : 'active'}`}</button>
  ),
}));

function round(index: number, status: RoundListItem['status'], name: string): RoundListItem {
  const createdAt = new Date(Date.UTC(2026, 8, index)).toISOString();
  return {
    createdAt,
    createdAtLabel: `created ${index}`,
    id: `round-${index}`,
    name,
    status,
  };
}

const ROUNDS = [
  round(1, 'active', 'ชุดงานฝึกงาน'),
  round(2, 'active', 'ชุดงานกิจกรรม'),
  round(3, 'closed', 'ชุดงานที่สิ้นสุดแล้ว'),
];

describe('RoundList', () => {
  afterEach(cleanup);

  it('offers deletion beside each card, outside its link', () => {
    render(<RoundList rounds={ROUNDS} />);

    const menu = screen.getByRole('button', { name: 'delete ชุดงานที่สิ้นสุดแล้ว closed' });
    expect(menu.closest('a')).toBeNull();
    expect(screen.getByRole('button', { name: 'delete ชุดงานฝึกงาน active' })).toBeDefined();
  });

  it('filters rounds by status with accessible pressed controls', async () => {
    const user = userEvent.setup();
    render(<RoundList rounds={ROUNDS} />);

    const allFilter = screen.getByRole('button', { name: 'round.filterAll 3' });
    const activeFilter = screen.getByRole('button', { name: 'round.statusActive 2' });
    const closedFilter = screen.getByRole('button', { name: 'round.statusClosed 1' });

    expect(allFilter.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(3);

    await user.click(closedFilter);

    expect(closedFilter.getAttribute('aria-pressed')).toBe('true');
    expect(allFilter.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('ชุดงานที่สิ้นสุดแล้ว')).toBeDefined();
    expect(screen.queryByText('ชุดงานฝึกงาน')).toBeNull();

    await user.click(activeFilter);

    expect(activeFilter.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByText('ชุดงานที่สิ้นสุดแล้ว')).toBeNull();
  });

  it('opens on the status a link asked for', () => {
    render(<RoundList initialStatus="closed" rounds={ROUNDS} />);

    expect(
      screen.getByRole('button', { name: 'round.statusClosed 1' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('searches by name and offers a way back when nothing matches', async () => {
    const user = userEvent.setup();
    render(<RoundList rounds={ROUNDS} />);

    await user.type(screen.getByRole('searchbox', { name: 'round.searchLabel' }), 'กิจกรรม');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'round.filterAll 1' })).toBeDefined();

    await user.type(screen.getByRole('searchbox', { name: 'round.searchLabel' }), 'ไม่มี');
    expect(screen.getByText('round.noMatch')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'round.clearFilters' }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('pages a long list and returns to the first page when the filter changes', async () => {
    const user = userEvent.setup();
    const rounds = Array.from({ length: ROUND_PAGE_SIZE + 1 }, (_, index) =>
      round(index + 1, index === 0 ? 'closed' : 'active', `ชุดงาน ${index + 1}`),
    );
    render(<RoundList rounds={rounds} />);

    expect(screen.getAllByRole('link')).toHaveLength(ROUND_PAGE_SIZE);
    await user.click(screen.getByRole('button', { name: 'round.pageLabel 2' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'round.pageLabel 2' }).getAttribute('aria-current'),
    ).toBe('page');

    await user.click(screen.getByRole('button', { name: `round.statusActive ${ROUND_PAGE_SIZE}` }));
    expect(screen.getAllByRole('link')).toHaveLength(ROUND_PAGE_SIZE);
    expect(screen.queryByRole('navigation', { name: 'round.paginationLabel' })).toBeNull();
  });
});
