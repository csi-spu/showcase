import type { StudentCollectionField } from '@/lib/student-collection-forms-contract';

export type CollectionAnswerValue = string | string[] | number | null;
export type CollectionAnswers = Record<string, CollectionAnswerValue>;

const MAX_SHORT_TEXT_LENGTH = 1_000;
const MAX_LONG_TEXT_LENGTH = 10_000;
const MAX_OPTIONS_PER_FIELD = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function isValueField(type: StudentCollectionField['type']): boolean {
  return type !== 'file_upload';
}

export function isChoiceField(type: StudentCollectionField['type']): boolean {
  return type === 'single_choice' || type === 'multiple_choice';
}

export function isEmptyAnswer(value: CollectionAnswerValue | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Mirrors Core's answer rules so the Student sees a problem while typing.
 *
 * Core validates the same rules again on save and on submit; this exists only
 * so the renderer can point at the field rather than wait for a round trip.
 * `isComplete` is false while drafting, which is what lets autosave accept work
 * in progress without ever rejecting an unfinished answer.
 */
export function isAnswerValid(
  field: StudentCollectionField,
  value: CollectionAnswerValue | undefined,
  options: { isComplete: boolean },
): boolean {
  if (!isValueField(field.type)) return value === undefined || value === null;
  if (isEmptyAnswer(value)) return !(options.isComplete && field.required);

  switch (field.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'date':
      return typeof value === 'string' && DATE_PATTERN.test(value) && isRealDate(value);
    case 'single_choice':
      return typeof value === 'string' && field.options?.includes(value) === true;
    case 'multiple_choice':
      return (
        Array.isArray(value) &&
        value.length <= MAX_OPTIONS_PER_FIELD &&
        new Set(value).size === value.length &&
        value.every((entry) => field.options?.includes(entry) === true)
      );
    case 'long_text':
      return typeof value === 'string' && value.length <= MAX_LONG_TEXT_LENGTH;
    default:
      return typeof value === 'string' && value.length <= MAX_SHORT_TEXT_LENGTH;
  }
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Collects every field that would block submission.
 *
 * Submit shows a summary rather than stopping at the first problem, so the
 * Student can see everything that needs attention in one pass.
 */
export function findSubmitBlockers(
  fields: StudentCollectionField[],
  answers: CollectionAnswers,
  fileCounts: Record<string, number>,
): { fieldId: string; reason: 'fileRequired' | 'invalid' | 'required' }[] {
  const blockers: { fieldId: string; reason: 'fileRequired' | 'invalid' | 'required' }[] = [];
  for (const field of fields) {
    if (!isValueField(field.type)) {
      if (field.required && (fileCounts[field.id] ?? 0) === 0) {
        blockers.push({ fieldId: field.id, reason: 'fileRequired' });
      }
      continue;
    }
    const value = answers[field.id];
    if (field.required && isEmptyAnswer(value)) {
      blockers.push({ fieldId: field.id, reason: 'required' });
      continue;
    }
    if (!isAnswerValid(field, value, { isComplete: true })) {
      blockers.push({ fieldId: field.id, reason: 'invalid' });
    }
  }
  return blockers;
}

/** Starts an answer at the shape its field expects, so a control is never uncontrolled. */
export function emptyAnswer(field: StudentCollectionField): CollectionAnswerValue {
  return field.type === 'multiple_choice' ? [] : '';
}

/**
 * Builds the working answer set for a form.
 *
 * A saved draft wins over a prefill: once the Student has touched a value, the
 * system must not quietly put its own value back.
 */
export function buildInitialAnswers(
  fields: StudentCollectionField[],
  draftAnswers: Record<string, unknown>,
  prefills: { fieldId: string; value: unknown }[],
): { answers: CollectionAnswers; prefilledFieldIds: string[] } {
  const answers: CollectionAnswers = {};
  const prefilledFieldIds: string[] = [];
  const prefillByField = new Map(prefills.map((prefill) => [prefill.fieldId, prefill.value]));

  for (const field of fields) {
    if (!isValueField(field.type)) continue;
    const draftValue = draftAnswers[field.id];
    if (draftValue !== undefined) {
      answers[field.id] = toAnswerValue(draftValue, field);
      continue;
    }
    const prefillValue = prefillByField.get(field.id);
    if (prefillValue !== undefined) {
      answers[field.id] = toAnswerValue(prefillValue, field);
      prefilledFieldIds.push(field.id);
      continue;
    }
    answers[field.id] = emptyAnswer(field);
  }
  return { answers, prefilledFieldIds };
}

/*
 * Values arrive as `unknown` from Core. They are narrowed, never coerced: a
 * value that does not fit the destination field is dropped rather than
 * reshaped, which keeps the no-coercion rule true on this side too.
 */
function toAnswerValue(value: unknown, field: StudentCollectionField): CollectionAnswerValue {
  let narrowed: CollectionAnswerValue;
  if (field.type === 'multiple_choice') {
    narrowed =
      Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
  } else if (field.type === 'number') {
    narrowed = typeof value === 'number' ? value : '';
  } else {
    narrowed = typeof value === 'string' ? value : '';
  }
  return isAnswerValid(field, narrowed, { isComplete: false }) ? narrowed : emptyAnswer(field);
}
