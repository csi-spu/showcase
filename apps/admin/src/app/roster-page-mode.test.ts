import { describe, expect, it } from 'vitest';
import { resolveRosterPageMode } from './roster-page-mode';

describe('Roster page mode', () => {
  it('uses a focused Batch result view whenever a Batch reference is present', () => {
    expect(resolveRosterPageMode(undefined)).toBe('entry');
    expect(resolveRosterPageMode('')).toBe('result');
    expect(resolveRosterPageMode('20000000-0000-4000-8000-000000000001')).toBe('result');
  });
});
