export const WORK_MANAGEMENT_VIEWS = ['reviews', 'removals', 'attributions', 'published'] as const;

export type WorkManagementView = (typeof WORK_MANAGEMENT_VIEWS)[number];

export function resolveWorkManagementPage(value: string | undefined): number {
  if (value === undefined) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function resolveWorkManagementView(value: string | undefined): WorkManagementView {
  return WORK_MANAGEMENT_VIEWS.find((view) => view === value) ?? 'reviews';
}

export function workManagementHref(
  view: WorkManagementView,
  input: { cursor?: string; page?: number; q?: string } = {},
): string {
  const query = new URLSearchParams({ view });
  if (input.cursor !== undefined) query.set('cursor', input.cursor);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.q !== undefined) query.set('q', input.q);
  return `/works?${query.toString()}`;
}
