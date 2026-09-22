/*
 * Field definitions and answer validation for collection forms.
 *
 * This is the single authority for what a field may look like and what counts as
 * a valid answer to it. The Instructor builder, the Student renderer, submission,
 * and reusable-value resolution all validate through here, so a value that one
 * path accepts cannot be rejected by another.
 */

export const COLLECTION_FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'date',
  'single_choice',
  'multiple_choice',
  'file_upload',
] as const;

export type CollectionFieldType = (typeof COLLECTION_FIELD_TYPES)[number];

/** Upload formats the platform inspects. Anything else is rejected outright. */
export const COLLECTION_FILE_TYPES = ['pdf', 'docx', 'xlsx', 'jpeg', 'png'] as const;

export type CollectionFileType = (typeof COLLECTION_FILE_TYPES)[number];

export const COLLECTION_FILE_CONTENT_TYPES: Record<CollectionFileType, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/*
 * Decimal bytes, as the product specification defines collection MB. These are
 * deliberately not the 1024-based limits used for public Work media.
 */
export const MAX_FILE_BYTES = 10_000_000;
export const MAX_SUBMISSION_BYTES = 50_000_000;
export const MAX_FILES_PER_FIELD = 5;

export const MAX_FIELDS_PER_FORM = 100;
export const MAX_OPTIONS_PER_FIELD = 100;
export const MAX_SHORT_TEXT_LENGTH = 1_000;
export const MAX_LONG_TEXT_LENGTH = 10_000;

export interface CollectionFileFieldConfig {
  allowedFileTypes: CollectionFileType[];
  maxFiles: number;
}

export interface CollectionField {
  description: string;
  file?: CollectionFileFieldConfig;
  id: string;
  label: string;
  /*
   * The explicit key that makes a value reusable across forms in a group. The
   * Instructor chooses it; it is never inferred from the label, because two
   * fields that read alike are not necessarily the same question.
   */
  mappingKey?: string;
  options?: string[];
  required: boolean;
  type: CollectionFieldType;
}

export type CollectionAnswerValue = string | string[] | number | null;
export type CollectionAnswers = Record<string, CollectionAnswerValue>;

const FIELD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/u;
const MAPPING_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function isChoiceField(type: CollectionFieldType): boolean {
  return type === 'single_choice' || type === 'multiple_choice';
}

/** File answers live in their own table, so they never appear in the answers map. */
export function isValueField(type: CollectionFieldType): boolean {
  return type !== 'file_upload';
}

export function isValidFieldId(value: string): boolean {
  return FIELD_ID_PATTERN.test(value);
}

export function isValidMappingKey(value: string): boolean {
  return MAPPING_KEY_PATTERN.test(value);
}

/**
 * Validates a whole field list. Returns the id of the first offending field so
 * the builder can put the message next to it rather than at the top of the page.
 */
export function findFieldDefinitionError(
  fields: CollectionField[],
): { code: string; fieldId: string | null } | null {
  if (fields.length === 0 || fields.length > MAX_FIELDS_PER_FORM) {
    return { code: 'FORM_FIELD_COUNT_INVALID', fieldId: null };
  }
  const seenIds = new Set<string>();
  const seenMappingKeys = new Set<string>();
  for (const field of fields) {
    if (!isValidFieldId(field.id) || seenIds.has(field.id)) {
      return { code: 'FIELD_ID_INVALID', fieldId: field.id };
    }
    seenIds.add(field.id);

    const label = field.label.trim();
    if (label.length === 0 || label.length > 200) {
      return { code: 'FIELD_LABEL_INVALID', fieldId: field.id };
    }
    if (field.description.length > 1_000) {
      return { code: 'FIELD_DESCRIPTION_INVALID', fieldId: field.id };
    }

    const choiceError = findChoiceError(field);
    if (choiceError !== null) return { code: choiceError, fieldId: field.id };

    const fileError = findFileConfigError(field);
    if (fileError !== null) return { code: fileError, fieldId: field.id };

    if (field.mappingKey !== undefined) {
      /*
       * A file must be uploaded fresh for every form, so it can never carry a
       * reusable value. Rejecting the key here stops a builder from implying it.
       */
      if (!isValueField(field.type) || !isValidMappingKey(field.mappingKey)) {
        return { code: 'FIELD_MAPPING_KEY_INVALID', fieldId: field.id };
      }
      if (seenMappingKeys.has(field.mappingKey)) {
        return { code: 'FIELD_MAPPING_KEY_DUPLICATE', fieldId: field.id };
      }
      seenMappingKeys.add(field.mappingKey);
    }
  }
  return null;
}

function findChoiceError(field: CollectionField): string | null {
  if (!isChoiceField(field.type)) {
    return field.options === undefined ? null : 'FIELD_OPTIONS_UNEXPECTED';
  }
  const options = field.options;
  if (options === undefined || options.length === 0 || options.length > MAX_OPTIONS_PER_FIELD) {
    return 'FIELD_OPTIONS_INVALID';
  }
  const seen = new Set<string>();
  for (const option of options) {
    const trimmed = option.trim();
    if (trimmed.length === 0 || option.length > 200 || seen.has(option)) {
      return 'FIELD_OPTIONS_INVALID';
    }
    seen.add(option);
  }
  return null;
}

function findFileConfigError(field: CollectionField): string | null {
  if (field.type !== 'file_upload') {
    return field.file === undefined ? null : 'FIELD_FILE_CONFIG_UNEXPECTED';
  }
  const file = field.file;
  if (file === undefined) return 'FIELD_FILE_CONFIG_INVALID';
  if (
    !Number.isInteger(file.maxFiles) ||
    file.maxFiles < 1 ||
    file.maxFiles > MAX_FILES_PER_FIELD
  ) {
    return 'FIELD_FILE_CONFIG_INVALID';
  }
  if (file.allowedFileTypes.length === 0) return 'FIELD_FILE_CONFIG_INVALID';
  const seen = new Set<CollectionFileType>();
  for (const type of file.allowedFileTypes) {
    if (!COLLECTION_FILE_TYPES.includes(type) || seen.has(type)) {
      return 'FIELD_FILE_CONFIG_INVALID';
    }
    seen.add(type);
  }
  return null;
}

/**
 * Checks one answer against one field. `isComplete` distinguishes an autosaved
 * draft, where a required field may still be empty, from a submission, where it
 * may not.
 */
export function isAnswerValid(
  field: CollectionField,
  value: CollectionAnswerValue | undefined,
  options: { isComplete: boolean },
): boolean {
  if (!isValueField(field.type)) return value === undefined || value === null;

  const isEmpty =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0);
  if (isEmpty) return !(options.isComplete && field.required);

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

/** Rejects answers for fields the form does not define, then validates each one. */
export function findAnswerError(
  fields: CollectionField[],
  answers: CollectionAnswers,
  options: { isComplete: boolean },
): { code: string; fieldId: string } | null {
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const fieldId of Object.keys(answers)) {
    const field = byId.get(fieldId);
    if (field === undefined || !isValueField(field.type)) {
      return { code: 'ANSWER_FIELD_UNKNOWN', fieldId };
    }
  }
  for (const field of fields) {
    if (!isValueField(field.type)) continue;
    if (!isAnswerValid(field, answers[field.id], options)) {
      return { code: 'ANSWER_INVALID', fieldId: field.id };
    }
  }
  return null;
}
