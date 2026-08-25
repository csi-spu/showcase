export const ATTRIBUTION_NAME_MAX_LENGTH = 100;
export const CONTRIBUTION_ROLE_MAX_LENGTH = 100;
export const AFFILIATION_MAX_LENGTH = 150;

export type AttributionInvitationState =
  'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired' | 'withdrawn';

type InvitationAction = 'accept' | 'reject' | 'revoke' | 'withdraw';

export function transitionAttributionInvitation(input: {
  action: InvitationAction;
  expiresAt: Date;
  now: Date;
  state: AttributionInvitationState;
}):
  | { outcome: 'expired'; state: 'expired' }
  | { outcome: 'invalid_transition'; state: AttributionInvitationState }
  | { outcome: 'transitioned'; state: AttributionInvitationState } {
  if (input.state === 'pending' && input.expiresAt.getTime() <= input.now.getTime()) {
    return { outcome: 'expired', state: 'expired' };
  }
  if (input.state === 'pending') {
    const next = { accept: 'accepted', reject: 'rejected', revoke: 'revoked' } as const;
    if (input.action in next && input.action !== 'withdraw') {
      return { outcome: 'transitioned', state: next[input.action] };
    }
  }
  if (input.state === 'accepted' && input.action === 'withdraw') {
    return { outcome: 'transitioned', state: 'withdrawn' };
  }
  return { outcome: 'invalid_transition', state: input.state };
}

type AcceptanceInput =
  | { attributionName: string; consent: boolean; kind: 'account'; studyYear: number }
  | {
      affiliation?: string;
      attributionName: string;
      consent: boolean;
      contributionRole: string;
      kind: 'external';
    };

export type NormalizedAttribution =
  | { attributionName: string; kind: 'account'; studyYear: number }
  | {
      affiliation?: string;
      attributionName: string;
      contributionRole: string;
      kind: 'external';
    };

export function evaluateAttributionAcceptance(
  input: AcceptanceInput,
): { isValid: false } | { attribution: NormalizedAttribution; isValid: true } {
  const attributionName = input.attributionName.trim();
  if (
    !input.consent ||
    attributionName.length < 1 ||
    attributionName.length > ATTRIBUTION_NAME_MAX_LENGTH
  ) {
    return { isValid: false };
  }
  if (input.kind === 'account') {
    if (!Number.isInteger(input.studyYear) || input.studyYear < 1 || input.studyYear > 8) {
      return { isValid: false };
    }
    return {
      attribution: { attributionName, kind: 'account', studyYear: input.studyYear },
      isValid: true,
    };
  }
  const contributionRole = input.contributionRole.trim();
  const affiliation = input.affiliation?.trim();
  if (
    contributionRole.length < 1 ||
    contributionRole.length > CONTRIBUTION_ROLE_MAX_LENGTH ||
    (affiliation !== undefined && affiliation.length > AFFILIATION_MAX_LENGTH)
  ) {
    return { isValid: false };
  }
  return {
    attribution: {
      ...(affiliation === undefined || affiliation.length === 0 ? {} : { affiliation }),
      attributionName,
      contributionRole,
      kind: 'external',
    },
    isValid: true,
  };
}
