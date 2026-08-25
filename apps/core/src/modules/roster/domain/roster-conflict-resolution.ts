export type RosterConflictResolution = 'accept_incoming_name' | 'keep_existing';

export type RosterConflictResolutionErrorCode =
  'ROSTER_CONFLICT_REASON_INVALID' | 'ROSTER_CONFLICT_REASON_REQUIRED';

export class RosterConflictResolutionError extends Error {
  constructor(readonly code: RosterConflictResolutionErrorCode) {
    super(code);
    this.name = 'RosterConflictResolutionError';
  }
}

export function prepareRosterConflictResolution(input: {
  reason?: string;
  resolution: RosterConflictResolution;
}): { reason: string | null; resolution: RosterConflictResolution } {
  const reason = input.reason?.trim().normalize('NFC') ?? '';
  if (input.resolution === 'accept_incoming_name' && reason.length === 0) {
    throw new RosterConflictResolutionError('ROSTER_CONFLICT_REASON_REQUIRED');
  }
  if (reason.length > 2_000) {
    throw new RosterConflictResolutionError('ROSTER_CONFLICT_REASON_INVALID');
  }
  return { reason: reason.length === 0 ? null : reason, resolution: input.resolution };
}
