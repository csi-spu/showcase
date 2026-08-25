export const CHANGE_REQUEST_REASONS = [
  'content',
  'attribution',
  'media',
  'links_tags',
  'policy',
  'other',
] as const;

export type ChangeRequestReason = (typeof CHANGE_REQUEST_REASONS)[number];

export interface ChangeRequest {
  feedback: string;
  reason: ChangeRequestReason;
}

export function normalizeChangeRequest(input: {
  feedback: string;
  reason: string;
}): ChangeRequest | null {
  const feedback = input.feedback.trim();
  return CHANGE_REQUEST_REASONS.includes(input.reason as ChangeRequestReason) &&
    feedback.length >= 10 &&
    feedback.length <= 2_000
    ? { feedback, reason: input.reason as ChangeRequestReason }
    : null;
}
