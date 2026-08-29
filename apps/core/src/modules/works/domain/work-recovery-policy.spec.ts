import {
  evaluateWorkRecoveryTransition,
  evaluateSubmitterSavedDraftTransition,
  normalizeRecoveryReason,
  type WorkRecoveryState,
} from './work-recovery-policy';

const PUBLISHED_REVISION_ID = '64000000-0000-4000-8000-000000000003';

describe('Work recovery policy', () => {
  it.each([
    ['archive', { activityState: 'archived', publicationState: 'unpublished' }],
    ['unpublish', { activityState: 'active', publicationState: 'unpublished' }],
  ] as const)('%s removes a Published Revision from public eligibility', (operation, expected) => {
    expect(evaluateWorkRecoveryTransition(publishedState(), operation)).toEqual({
      isAllowed: true,
      state: { ...expected, publishedRevisionId: PUBLISHED_REVISION_ID, version: 8 },
    });
  });

  it('restore-active never republishes implicitly', () => {
    expect(
      evaluateWorkRecoveryTransition(
        {
          activityState: 'archived',
          publicationState: 'unpublished',
          publishedRevisionId: PUBLISHED_REVISION_ID,
          version: 8,
        },
        'restore_active',
      ),
    ).toEqual({
      isAllowed: true,
      state: {
        activityState: 'active',
        publicationState: 'unpublished',
        publishedRevisionId: PUBLISHED_REVISION_ID,
        version: 9,
      },
    });
  });

  it('restores the unchanged retained Published Revision only through an explicit action', () => {
    expect(
      evaluateWorkRecoveryTransition(
        {
          activityState: 'active',
          publicationState: 'unpublished',
          publishedRevisionId: PUBLISHED_REVISION_ID,
          version: 3,
        },
        'restore_publication',
      ),
    ).toEqual({
      isAllowed: true,
      state: {
        activityState: 'active',
        publicationState: 'published',
        publishedRevisionId: PUBLISHED_REVISION_ID,
        version: 4,
      },
    });
  });

  it.each([
    [publishedState(), 'restore_publication'],
    [publishedState(), 'restore_active'],
    [
      {
        activityState: 'archived',
        publicationState: 'unpublished',
        publishedRevisionId: PUBLISHED_REVISION_ID,
        version: 1,
      } satisfies WorkRecoveryState,
      'unpublish',
    ],
    [
      {
        activityState: 'active',
        publicationState: 'unpublished',
        publishedRevisionId: null,
        version: 1,
      } satisfies WorkRecoveryState,
      'restore_publication',
    ],
  ] as const)('rejects an invalid %s transition', (state, operation) => {
    expect(evaluateWorkRecoveryTransition(state, operation)).toEqual({ isAllowed: false });
  });

  it('trims and Unicode-normalizes an audited reason', () => {
    expect(normalizeRecoveryReason('  เหตุผลการนำผลงานออกจากการเผยแพร่  ')).toBe(
      'เหตุผลการนำผลงานออกจากการเผยแพร่'.normalize('NFKC'),
    );
  });

  it.each(['', 'สั้น', 'x'.repeat(1001)])('rejects invalid recovery reason %p', (reason) => {
    expect(normalizeRecoveryReason(reason)).toBeNull();
  });

  it('archives and restores only a Submitter-saved never-published Draft', () => {
    expect(
      evaluateSubmitterSavedDraftTransition({
        activityState: 'active',
        archiveSource: null,
        hasDraft: true,
        hasPendingRevision: false,
        operation: 'archive_saved_draft',
        publicationState: 'never_published',
      }),
    ).toEqual({ activityState: 'archived', isAllowed: true });
    expect(
      evaluateSubmitterSavedDraftTransition({
        activityState: 'archived',
        archiveSource: 'submitter',
        hasDraft: true,
        hasPendingRevision: false,
        operation: 'restore_saved_draft',
        publicationState: 'never_published',
      }),
    ).toEqual({ activityState: 'active', isAllowed: true });
  });

  it.each([
    ['published', null, false],
    ['never_published', null, true],
    ['never_published', 'admin', false],
  ] as const)(
    'rejects ineligible saved Draft state %s/%s/%s',
    (publicationState, archiveSource, hasPendingRevision) => {
      expect(
        evaluateSubmitterSavedDraftTransition({
          activityState: archiveSource === null ? 'active' : 'archived',
          archiveSource,
          hasDraft: true,
          hasPendingRevision,
          operation: archiveSource === null ? 'archive_saved_draft' : 'restore_saved_draft',
          publicationState,
        }),
      ).toEqual({ isAllowed: false });
    },
  );
});

function publishedState(): WorkRecoveryState {
  return {
    activityState: 'active',
    publicationState: 'published',
    publishedRevisionId: PUBLISHED_REVISION_ID,
    version: 7,
  };
}
