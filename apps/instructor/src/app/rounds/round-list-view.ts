import { clampPage } from '@/lib/pagination';

export type RoundStatus = 'active' | 'closed';
export type RoundStatusFilter = 'all' | RoundStatus;
export type RoundSort = 'name' | 'newest' | 'oldest';

export const ROUND_SORTS: readonly RoundSort[] = ['newest', 'oldest', 'name'];
/** Two columns of cards, so a page ends on a full row. */
export const ROUND_PAGE_SIZE = 12;

export interface RoundListItem {
  createdAt: string;
  /** Formatted on the server, so the date is always in Bangkok time. */
  createdAtLabel: string;
  id: string;
  name: string;
  status: RoundStatus;
}

export interface RoundListQuery {
  page: number;
  search: string;
  sort: RoundSort;
  status: RoundStatusFilter;
}

export interface RoundListView {
  /** The page actually shown, after clamping to the pages that exist. */
  page: number;
  pageCount: number;
  rows: RoundListItem[];
  /** Rounds matching the search, per status; the status filter itself is not applied. */
  statusCounts: Record<RoundStatusFilter, number>;
  /** Rounds matching both the search and the status filter. */
  total: number;
}

const COLLATOR = new Intl.Collator('th');

function normalize(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('th').replace(/\s+/gu, ' ').trim();
}

function comparator(sort: RoundSort): (left: RoundListItem, right: RoundListItem) => number {
  const byName = (left: RoundListItem, right: RoundListItem) =>
    COLLATOR.compare(left.name, right.name);
  const byCreated = (left: RoundListItem, right: RoundListItem) =>
    Date.parse(left.createdAt) - Date.parse(right.createdAt);

  switch (sort) {
    case 'name':
      return byName;
    case 'newest':
      return (left, right) => byCreated(right, left) || byName(left, right);
    case 'oldest':
      return (left, right) => byCreated(left, right) || byName(left, right);
  }
}

/**
 * Searches, filters, sorts and pages the Instructor's rounds.
 *
 * Core returns the rounds as one bounded list, so this runs over what is
 * already loaded instead of asking Core again for every keystroke.
 */
export function viewRoundList(
  rounds: readonly RoundListItem[],
  query: RoundListQuery,
): RoundListView {
  const search = normalize(query.search);
  const matching =
    search === '' ? [...rounds] : rounds.filter((round) => normalize(round.name).includes(search));

  const statusCounts: Record<RoundStatusFilter, number> = {
    active: 0,
    all: matching.length,
    closed: 0,
  };
  for (const round of matching) statusCounts[round.status] += 1;

  const filtered =
    query.status === 'all' ? matching : matching.filter((round) => round.status === query.status);
  filtered.sort(comparator(query.sort));

  const pageCount = Math.max(1, Math.ceil(filtered.length / ROUND_PAGE_SIZE));
  const page = clampPage(query.page, pageCount);
  const start = (page - 1) * ROUND_PAGE_SIZE;

  return {
    page,
    pageCount,
    rows: filtered.slice(start, start + ROUND_PAGE_SIZE),
    statusCounts,
    total: filtered.length,
  };
}
