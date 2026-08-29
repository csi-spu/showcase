export type WorkRecoveryOperation =
  'archive' | 'restore_active' | 'restore_publication' | 'unpublish';

export interface WorkRecoveryState {
  activityState: 'active' | 'archived';
  publicationState: 'never_published' | 'published' | 'unpublished';
  publishedRevisionId: string | null;
  version: number;
}

export type WorkRecoveryTransition =
  { isAllowed: false } | { isAllowed: true; state: WorkRecoveryState };

export function normalizeRecoveryReason(reason: string): string | null {
  const normalized = reason.normalize('NFKC').trim();
  return normalized.length >= 10 && normalized.length <= 1_000 ? normalized : null;
}

export function evaluateSubmitterSavedDraftTransition(input: {
  activityState: 'active' | 'archived';
  archiveSource: 'admin' | 'submitter' | null;
  hasDraft: boolean;
  hasPendingRevision: boolean;
  operation: 'archive_saved_draft' | 'restore_saved_draft';
  publicationState: 'never_published' | 'published' | 'unpublished';
}): { isAllowed: false } | { activityState: 'active' | 'archived'; isAllowed: true } {
  if (
    input.operation === 'archive_saved_draft' &&
    input.activityState === 'active' &&
    input.archiveSource === null &&
    input.hasDraft &&
    !input.hasPendingRevision &&
    input.publicationState === 'never_published'
  ) {
    return { activityState: 'archived', isAllowed: true };
  }
  if (
    input.operation === 'restore_saved_draft' &&
    input.activityState === 'archived' &&
    input.archiveSource === 'submitter' &&
    input.hasDraft &&
    !input.hasPendingRevision &&
    input.publicationState === 'never_published'
  ) {
    return { activityState: 'active', isAllowed: true };
  }
  return { isAllowed: false };
}

export function evaluateWorkRecoveryTransition(
  state: WorkRecoveryState,
  operation: WorkRecoveryOperation,
): WorkRecoveryTransition {
  if (operation === 'archive' && state.activityState === 'active') {
    return changed(state, 'archived', 'unpublished');
  }
  if (
    operation === 'unpublish' &&
    state.activityState === 'active' &&
    state.publicationState === 'published' &&
    state.publishedRevisionId !== null
  ) {
    return changed(state, 'active', 'unpublished');
  }
  if (operation === 'restore_active' && state.activityState === 'archived') {
    return changed(state, 'active', 'unpublished');
  }
  if (
    operation === 'restore_publication' &&
    state.activityState === 'active' &&
    state.publicationState === 'unpublished' &&
    state.publishedRevisionId !== null
  ) {
    return changed(state, 'active', 'published');
  }
  return { isAllowed: false };
}

function changed(
  state: WorkRecoveryState,
  activityState: WorkRecoveryState['activityState'],
  publicationState: WorkRecoveryState['publicationState'],
): WorkRecoveryTransition {
  return {
    isAllowed: true,
    state: {
      activityState,
      publicationState,
      publishedRevisionId: state.publishedRevisionId,
      version: state.version + 1,
    },
  };
}
