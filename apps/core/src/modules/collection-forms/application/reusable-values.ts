/*
 * Reusable mapped values.
 *
 * A Student who already answered "company name" in a passed submission should not
 * retype it on the next form in the same group. The rules are deliberately strict,
 * because a wrong prefill is worse than an empty field: it looks like the
 * Student's own answer.
 *
 * - Only responses that passed Instructor checking are eligible. Drafts, pending,
 *   and returned responses are not.
 * - "Latest" means the source submission's submitted_at, never its checking time.
 *   Checking an older submission later must not make its value newer.
 * - Source and destination must share the explicit mapping key AND the field type.
 * - The value must satisfy the destination field's own validation, including its
 *   allowed choices. Otherwise the field is left empty; nothing is coerced, and no
 *   older value is substituted.
 */

import {
  isAnswerValid,
  isValueField,
  type CollectionAnswerValue,
  type CollectionField,
} from './collection-field';

/** One candidate value drawn from a passed submission in the same group. */
export interface ReusableValueCandidate {
  fieldType: CollectionField['type'];
  mappingKey: string;
  /** submitted_at of the source version. Ordering authority. */
  submittedAt: Date;
  value: CollectionAnswerValue;
}

export interface ResolvedPrefill {
  fieldId: string;
  mappingKey: string;
  value: CollectionAnswerValue;
}

/**
 * Picks the prefill value for each mapped destination field.
 *
 * Returns only the fields that actually resolved, so a caller can tell the
 * Student which values the system filled in and which they must enter themselves.
 */
export function resolvePrefills(
  fields: CollectionField[],
  candidates: ReusableValueCandidate[],
): ResolvedPrefill[] {
  const latestByKey = selectLatestByKeyAndType(candidates);
  const resolved: ResolvedPrefill[] = [];

  for (const field of fields) {
    const mappingKey = field.mappingKey;
    if (mappingKey === undefined || !isValueField(field.type)) continue;

    const candidate = latestByKey.get(compositeKey(mappingKey, field.type));
    if (candidate === undefined) continue;

    /*
     * The destination decides. A value that passed an older form's validation can
     * still be wrong here — a choice that this form no longer offers, for example.
     * An incompatible value leaves the field empty rather than falling back.
     */
    if (!isAnswerValid(field, candidate.value, { isComplete: true })) continue;

    resolved.push({ fieldId: field.id, mappingKey, value: candidate.value });
  }
  return resolved;
}

/*
 * Keyed by mapping key *and* type: the same key used by a short_text field and a
 * single_choice field describes two different questions, and neither may feed the
 * other.
 */
function selectLatestByKeyAndType(
  candidates: ReusableValueCandidate[],
): Map<string, ReusableValueCandidate> {
  const latest = new Map<string, ReusableValueCandidate>();
  for (const candidate of candidates) {
    const key = compositeKey(candidate.mappingKey, candidate.fieldType);
    const existing = latest.get(key);
    if (existing === undefined || candidate.submittedAt > existing.submittedAt) {
      latest.set(key, candidate);
    }
  }
  return latest;
}

function compositeKey(mappingKey: string, fieldType: CollectionField['type']): string {
  return `${mappingKey}\u0000${fieldType}`;
}
