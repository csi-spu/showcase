import { describe, expect, it } from 'vitest';
import { decisionAvailability } from './decision-availability';

describe('decisionAvailability', () => {
  it('offers a decision on the latest version of an open round', () => {
    expect(
      decisionAvailability({ isLatest: true, isRoundClosed: false, status: 'awaiting_checking' }),
    ).toBe('available');
  });

  it('offers none once the latest version has been decided', () => {
    expect(decisionAvailability({ isLatest: true, isRoundClosed: false, status: 'passed' })).toBe(
      'decided',
    );
    expect(
      decisionAvailability({ isLatest: true, isRoundClosed: false, status: 'changes_required' }),
    ).toBe('decided');
  });

  it('keeps an older version read-only', () => {
    expect(
      decisionAvailability({ isLatest: false, isRoundClosed: false, status: 'awaiting_checking' }),
    ).toBe('olderVersion');
  });

  it('explains a closed round before an older version', () => {
    expect(
      decisionAvailability({ isLatest: false, isRoundClosed: true, status: 'awaiting_checking' }),
    ).toBe('roundClosed');
  });

  it('never decides for a withdrawn Student', () => {
    expect(decisionAvailability({ isLatest: true, isRoundClosed: true, status: 'withdrawn' })).toBe(
      'withdrawn',
    );
  });
});
