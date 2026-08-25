import { evaluateWorkDraft, type NormalizedWorkDraft } from './work-draft-policy';

const ATTRIBUTION_NAME_MAX_LENGTH = 100;
const CONTRIBUTOR_LIMIT = 20;

export type WorkRevisionCompletenessReason =
  | 'attribution_duplicate'
  | 'attribution_limit_exceeded'
  | 'attribution_unresolved'
  | 'incomplete_content'
  | 'invalid_submitter_attribution'
  | 'media_not_ready'
  | 'missing_poster';

export type RevisionInvitation =
  | {
      affiliation: string | null;
      attributionName: string;
      contributionRole: string | null;
      kind: 'account' | 'external';
      personId: string;
      state: 'accepted';
      studyYear: number | null;
    }
  | { state: 'expired' | 'pending' | 'rejected' | 'revoked' | 'withdrawn' };

export interface WorkRevisionCandidate {
  academicRange: { currentAcademicYear: number; entryYear: number };
  draft: NormalizedWorkDraft;
  invitations: RevisionInvitation[];
  media: Array<{
    assetId: string;
    kind: 'gallery' | 'poster';
    position: number;
    status: 'pending_upload' | 'processing' | 'ready' | 'rejected' | 'uploaded';
  }>;
  submitterAttribution: { attributionName: string; studyYear: number };
}

export type WorkRevisionCompleteness =
  { isComplete: false; reason: WorkRevisionCompletenessReason } | { isComplete: true };

export interface SubmitterAttribution {
  attributionName: string;
  studyYear: number;
}

export function normalizeSubmitterAttribution(
  input: SubmitterAttribution,
): SubmitterAttribution | null {
  const attributionName = input.attributionName.trim();
  return attributionName.length >= 1 &&
    attributionName.length <= ATTRIBUTION_NAME_MAX_LENGTH &&
    Number.isInteger(input.studyYear) &&
    input.studyYear >= 1 &&
    input.studyYear <= 8
    ? { attributionName, studyYear: input.studyYear }
    : null;
}

export function evaluateWorkRevisionCandidate(
  candidate: WorkRevisionCandidate,
): WorkRevisionCompleteness {
  if (normalizeSubmitterAttribution(candidate.submitterAttribution) === null) {
    return { isComplete: false, reason: 'invalid_submitter_attribution' };
  }

  const content = evaluateWorkDraft(
    {
      ...candidate.draft,
      tags: candidate.draft.tags.map((tag) => tag.displayLabel),
      videoLinks: candidate.draft.videoLinks.map((link) => link.url),
    },
    candidate.academicRange,
  );
  if (!content.isValid) return { isComplete: false, reason: 'incomplete_content' };

  const acceptedCount = candidate.invitations.filter(
    (invitation) => invitation.state === 'accepted',
  ).length;
  if (acceptedCount > CONTRIBUTOR_LIMIT) {
    return { isComplete: false, reason: 'attribution_limit_exceeded' };
  }
  const acceptedPersonIds = candidate.invitations.flatMap((invitation) =>
    invitation.state === 'accepted' ? [invitation.personId] : [],
  );
  if (new Set(acceptedPersonIds).size !== acceptedPersonIds.length) {
    return { isComplete: false, reason: 'attribution_duplicate' };
  }
  if (candidate.invitations.some((invitation) => invitation.state === 'pending')) {
    return { isComplete: false, reason: 'attribution_unresolved' };
  }

  if (candidate.media.some((media) => media.status !== 'ready')) {
    return { isComplete: false, reason: 'media_not_ready' };
  }
  const posters = candidate.media.filter((media) => media.kind === 'poster');
  if (posters.length !== 1 || posters[0]?.position !== 1) {
    return { isComplete: false, reason: 'missing_poster' };
  }

  return { isComplete: true };
}
