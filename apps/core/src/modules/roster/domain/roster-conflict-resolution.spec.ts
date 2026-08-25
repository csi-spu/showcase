import {
  RosterConflictResolutionError,
  prepareRosterConflictResolution,
} from './roster-conflict-resolution';

describe('prepareRosterConflictResolution', () => {
  it('requires an actionable reason when accepting the incoming Thai name', () => {
    expect(() =>
      prepareRosterConflictResolution({ resolution: 'accept_incoming_name', reason: '   ' }),
    ).toThrow(new RosterConflictResolutionError('ROSTER_CONFLICT_REASON_REQUIRED'));
  });

  it('trims and normalizes the accepted-name reason for audit', () => {
    const decomposedReason = '\u0E01\u0E33';

    expect(
      prepareRosterConflictResolution({
        resolution: 'accept_incoming_name',
        reason: ` ${decomposedReason} `,
      }),
    ).toEqual({
      reason: decomposedReason.normalize('NFC'),
      resolution: 'accept_incoming_name',
    });
  });
});
