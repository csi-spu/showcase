export type RosterPageMode = 'entry' | 'result';

export function resolveRosterPageMode(batchId: string | undefined): RosterPageMode {
  return batchId === undefined ? 'entry' : 'result';
}
