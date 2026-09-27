import { describe, expect, it } from 'vitest';
import { ROUND_PAGE_SIZE, viewRoundList, type RoundListItem } from './round-list-view';

function round(
  index: number,
  status: RoundListItem['status'],
  name = `ชุดงาน ${index}`,
): RoundListItem {
  const createdAt = new Date(Date.UTC(2026, 0, index)).toISOString();
  return { createdAt, createdAtLabel: createdAt, id: `round-${index}`, name, status };
}

const QUERY = { page: 1, search: '', sort: 'newest', status: 'all' } as const;

describe('viewRoundList', () => {
  it('counts statuses over the search, before the status filter', () => {
    const rounds = [
      round(1, 'active', 'ภาคเรียนที่ 1'),
      round(2, 'closed', 'ภาคเรียนที่ 2'),
      round(3, 'active', 'กิจกรรม'),
    ];

    const view = viewRoundList(rounds, { ...QUERY, search: '  ภาคเรียน ', status: 'active' });

    expect(view.statusCounts).toEqual({ active: 1, all: 2, closed: 1 });
    expect(view.rows.map((item) => item.id)).toEqual(['round-1']);
    expect(view.total).toBe(1);
  });

  it('sorts newest, oldest and by Thai name', () => {
    const rounds = [round(1, 'active', 'ข'), round(2, 'active', 'ก'), round(3, 'closed', 'ค')];

    expect(viewRoundList(rounds, QUERY).rows.map((item) => item.id)).toEqual([
      'round-3',
      'round-2',
      'round-1',
    ]);
    expect(viewRoundList(rounds, { ...QUERY, sort: 'oldest' }).rows.map((item) => item.id)).toEqual(
      ['round-1', 'round-2', 'round-3'],
    );
    expect(viewRoundList(rounds, { ...QUERY, sort: 'name' }).rows.map((item) => item.name)).toEqual(
      ['ก', 'ข', 'ค'],
    );
  });

  it('pages the list and clamps a page past the end', () => {
    const rounds = Array.from({ length: ROUND_PAGE_SIZE + 2 }, (_, index) =>
      round(index + 1, 'active'),
    );

    const last = viewRoundList(rounds, { ...QUERY, page: 9 });

    expect(last.pageCount).toBe(2);
    expect(last.page).toBe(2);
    expect(last.rows).toHaveLength(2);
  });
});
