import {
  decodeDeletionLogCursor,
  deletionBlocker,
  encodeDeletionLogCursor,
  matchesConfirmationName,
  restoreAvailability,
} from './collection-deletion';

describe('matchesConfirmationName', () => {
  it('accepts the exact name', () => {
    expect(matchesConfirmationName('สหกิจ 2569', 'สหกิจ 2569')).toBe(true);
  });

  it('ignores whitespace around the typed name', () => {
    expect(matchesConfirmationName('สหกิจ 2569', '  สหกิจ 2569\n')).toBe(true);
  });

  it.each([
    ['a different name', 'สหกิจ 2568'],
    ['a prefix', 'สหกิจ'],
    ['different inner spacing', 'สหกิจ  2569'],
    ['empty text', ''],
  ])('rejects %s', (_case, typed) => {
    expect(matchesConfirmationName('สหกิจ 2569', typed)).toBe(false);
  });

  it('compares letter case exactly', () => {
    expect(matchesConfirmationName('Coop A', 'coop a')).toBe(false);
  });
});

describe('deletionBlocker', () => {
  it('lets a closed round be deleted as a whole', () => {
    expect(deletionBlocker({ roundStatus: 'closed', targetKind: 'round' })).toBeNull();
  });

  it.each(['group', 'form'] as const)('refuses a %s inside a closed round', (targetKind) => {
    expect(deletionBlocker({ roundStatus: 'closed', targetKind })).toBe('round_closed');
  });

  it.each(['round', 'group', 'form'] as const)('allows a %s in an active round', (targetKind) => {
    expect(deletionBlocker({ roundStatus: 'active', targetKind })).toBeNull();
  });
});

describe('restoreAvailability', () => {
  const live = { deletedGroupName: null, deletedRoundName: null, isRestored: false };

  it('allows restoring a deletion whose ancestors are live', () => {
    expect(restoreAvailability({ ...live, roundStatus: 'active', targetKind: 'form' })).toEqual({
      status: 'available',
    });
  });

  it('reports a restored deletion before anything else', () => {
    expect(
      restoreAvailability({
        deletedGroupName: 'สหกิจ A',
        deletedRoundName: 'สหกิจ 2569',
        isRestored: true,
        roundStatus: 'closed',
        targetKind: 'form',
      }),
    ).toEqual({ status: 'already_restored' });
  });

  it('names the round first when both ancestors are deleted', () => {
    expect(
      restoreAvailability({
        deletedGroupName: 'สหกิจ A',
        deletedRoundName: 'สหกิจ 2569',
        isRestored: false,
        roundStatus: 'active',
        targetKind: 'form',
      }),
    ).toEqual({ ancestorKind: 'round', ancestorName: 'สหกิจ 2569', status: 'ancestor_deleted' });
  });

  it('names a deleted group', () => {
    expect(
      restoreAvailability({
        ...live,
        deletedGroupName: 'สหกิจ A',
        roundStatus: 'active',
        targetKind: 'form',
      }),
    ).toEqual({ ancestorKind: 'group', ancestorName: 'สหกิจ A', status: 'ancestor_deleted' });
  });

  it('prefers a deleted ancestor over a closed round', () => {
    expect(
      restoreAvailability({
        ...live,
        deletedRoundName: 'สหกิจ 2569',
        roundStatus: 'closed',
        targetKind: 'group',
      }),
    ).toEqual({ ancestorKind: 'round', ancestorName: 'สหกิจ 2569', status: 'ancestor_deleted' });
  });

  it.each(['group', 'form'] as const)('refuses a %s inside a closed round', (targetKind) => {
    expect(restoreAvailability({ ...live, roundStatus: 'closed', targetKind })).toEqual({
      status: 'round_closed',
    });
  });

  it('lets a closed round be restored as a whole', () => {
    expect(restoreAvailability({ ...live, roundStatus: 'closed', targetKind: 'round' })).toEqual({
      status: 'available',
    });
  });
});

describe('deletion log cursor', () => {
  const position = {
    deletedAtMicros: '1790071200123456',
    deletionId: '58000000-0000-4000-8000-00000000000a',
  };

  it('round-trips a position', () => {
    expect(decodeDeletionLogCursor(encodeDeletionLogCursor(position))).toEqual(position);
  });

  it('is opaque rather than a readable timestamp or id', () => {
    const cursor = encodeDeletionLogCursor(position);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(cursor).not.toContain(position.deletionId);
    expect(cursor).not.toContain(position.deletedAtMicros);
  });

  it.each([
    ['empty text', ''],
    ['not base64url', '***'],
    ['a missing id', Buffer.from('1790071200123456').toString('base64url')],
    ['a non-numeric time', Buffer.from(`abc.${position.deletionId}`).toString('base64url')],
    ['a malformed id', Buffer.from('1790071200123456.not-a-uuid').toString('base64url')],
    [
      'trailing content',
      Buffer.from(`1790071200123456.${position.deletionId}.x`).toString('base64url'),
    ],
    ['an oversized cursor', 'A'.repeat(200)],
  ])('rejects %s', (_case, cursor) => {
    expect(decodeDeletionLogCursor(cursor)).toBeNull();
  });
});
