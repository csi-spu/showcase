import type {
  CollectionFieldType,
  CollectionFileType,
  InstructorCollectionField,
} from '@/lib/instructor-collection-forms-contract';

/*
 * Error messages the builder can show. Each one maps to a Core `errorCode`, so a
 * rule the server enforces always has a sentence the Instructor can act on.
 */
export type CollectionFormsErrorMessage =
  | 'deadlineInvalid'
  | 'deadlineNotExtendable'
  | 'exportExpired'
  | 'exportFailed'
  | 'exportNotFound'
  | 'exportNotReady'
  | 'exportTooLarge'
  | 'fieldDescriptionInvalid'
  | 'fieldIdInvalid'
  | 'fieldLabelInvalid'
  | 'fieldMappingKeyDuplicate'
  | 'fieldMappingKeyInvalid'
  | 'fieldFileConfigInvalid'
  | 'fieldOptionsInvalid'
  | 'formFieldCountInvalid'
  | 'formInvalid'
  | 'formNotFound'
  | 'formNotOpen'
  | 'formNotClosed'
  | 'formStructureLocked'
  | 'groupNotFound'
  | 'checkReasonRequired'
  | 'submissionNotFound'
  | 'submissionStale'
  | 'invalid'
  | 'reasonRequired'
  | 'roundClosed'
  | 'roundNotFound'
  | 'roundAlreadyInState'
  | 'sessionExpired'
  | 'templateNameInvalid'
  | 'templateNotFound'
  | 'unavailable';

export interface CollectionFormActionState {
  error: CollectionFormsErrorMessage | null;
  /** Set when the failure belongs to one field, so the builder can scroll to it. */
  fieldId: string | null;
  submitted: boolean;
}

export const INITIAL_FORM_ACTION_STATE: CollectionFormActionState = {
  error: null,
  fieldId: null,
  submitted: false,
};

export type CreateFormAction = (
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

export type OpenFormAction = CreateFormAction;
export type SaveTemplateAction = CreateFormAction;

/** Maps a Core `errorCode` onto the message key the builder renders. */
export function toFormsErrorMessage(code: string): CollectionFormsErrorMessage {
  switch (code) {
    case 'DEADLINE_NOT_EXTENDABLE':
      return 'deadlineNotExtendable';
    case 'FIELD_DESCRIPTION_INVALID':
      return 'fieldDescriptionInvalid';
    case 'FIELD_FILE_CONFIG_INVALID':
      return 'fieldFileConfigInvalid';
    case 'FIELD_ID_INVALID':
      return 'fieldIdInvalid';
    case 'FIELD_LABEL_INVALID':
      return 'fieldLabelInvalid';
    case 'FIELD_MAPPING_KEY_DUPLICATE':
      return 'fieldMappingKeyDuplicate';
    case 'FIELD_MAPPING_KEY_INVALID':
      return 'fieldMappingKeyInvalid';
    case 'FIELD_OPTIONS_INVALID':
      return 'fieldOptionsInvalid';
    case 'FORM_FIELD_COUNT_INVALID':
      return 'formFieldCountInvalid';
    case 'FORM_INVALID':
      return 'formInvalid';
    case 'FORM_NOT_FOUND':
      return 'formNotFound';
    case 'FORM_ALREADY_OPENED':
    case 'FORM_STRUCTURE_LOCKED':
      return 'formStructureLocked';
    case 'CHECK_REASON_REQUIRED':
      return 'checkReasonRequired';
    case 'SUBMISSION_NOT_FOUND':
      return 'submissionNotFound';
    /* The Student submitted again while this was being reviewed. The Instructor
     * must look at the newer submission rather than judge a stale one. */
    case 'SUBMISSION_STALE':
      return 'submissionStale';
    case 'GROUP_NOT_FOUND':
      return 'groupNotFound';
    case 'EXPORT_NOT_FOUND':
      return 'exportNotFound';
    /* The artifact was never built, so there is nothing to download yet. */
    case 'EXPORT_NOT_READY':
      return 'exportNotReady';
    case 'EXPORT_EXPIRED':
      return 'exportExpired';
    case 'EXPORT_FAILED':
      return 'exportFailed';
    /*
     * Refused rather than trimmed: a workbook silently missing Students would
     * be read as a complete record of the group.
     */
    case 'EXPORT_TOO_LARGE':
      return 'exportTooLarge';
    case 'ROUND_CLOSED':
      return 'roundClosed';
    case 'ROUND_NOT_FOUND':
      return 'roundNotFound';
    /* Someone else already closed or reopened this round. The Instructor is
     * looking at a stale page rather than at a round that refused them. */
    case 'ROUND_ALREADY_CLOSED':
    case 'ROUND_ALREADY_ACTIVE':
      return 'roundAlreadyInState';
    case 'FORM_NOT_OPEN':
      return 'formNotOpen';
    case 'FORM_NOT_CLOSED':
      return 'formNotClosed';
    case 'REASON_REQUIRED':
    case 'REASON_TOO_LONG':
      return 'reasonRequired';
    case 'TEMPLATE_NOT_FOUND':
      return 'templateNotFound';
    default:
      return 'unavailable';
  }
}

/*
 * The builder's working copy of a field. It differs from the Core shape only in
 * that choices are edited as one textarea value, which keeps reordering and
 * editing simple without inventing a nested editor.
 */
export interface DraftField {
  description: string;
  fileMaxFiles: number;
  fileTypes: CollectionFileType[];
  id: string;
  label: string;
  mappingKey: string;
  optionsText: string;
  required: boolean;
  type: CollectionFieldType;
}

export const MAX_FIELDS_PER_FORM = 100;
export const MAX_FILES_PER_FIELD = 5;

export function isChoiceType(type: CollectionFieldType): boolean {
  return type === 'single_choice' || type === 'multiple_choice';
}

/** A file must be uploaded fresh for every form, so it can never carry a mapped value. */
export function canMapType(type: CollectionFieldType): boolean {
  return type !== 'file_upload';
}

export function createDraftField(id: string): DraftField {
  return {
    description: '',
    fileMaxFiles: 1,
    fileTypes: ['pdf'],
    id,
    label: '',
    mappingKey: '',
    optionsText: '',
    required: true,
    type: 'short_text',
  };
}

export function toDraftField(field: InstructorCollectionField): DraftField {
  return {
    description: field.description,
    fileMaxFiles: field.file?.maxFiles ?? 1,
    fileTypes: field.file?.allowedFileTypes ?? ['pdf'],
    id: field.id,
    label: field.label,
    mappingKey: field.mappingKey ?? '',
    optionsText: (field.options ?? []).join('\n'),
    required: field.required,
    type: field.type,
  };
}

export function parseOptions(optionsText: string): string[] {
  return optionsText
    .split('\n')
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

/**
 * Converts the builder's working copy into the Core payload.
 *
 * Keys that do not apply to the chosen type are omitted rather than sent empty,
 * because Core rejects options on a non-choice field and a mapping key on a file.
 */
export function toFieldPayload(field: DraftField): InstructorCollectionField {
  const payload: InstructorCollectionField = {
    description: field.description.trim(),
    id: field.id,
    label: field.label.trim(),
    required: field.required,
    type: field.type,
  };
  if (isChoiceType(field.type)) payload.options = parseOptions(field.optionsText);
  if (field.type === 'file_upload') {
    payload.file = { allowedFileTypes: field.fileTypes, maxFiles: field.fileMaxFiles };
  }
  const mappingKey = field.mappingKey.trim();
  if (mappingKey.length > 0 && canMapType(field.type)) payload.mappingKey = mappingKey;
  return payload;
}

const MAPPING_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/u;

/**
 * Client-side validation for immediate feedback. Core validates the same rules
 * again; this exists so the Instructor sees the problem beside the field rather
 * than after a round trip.
 */
export function findDraftFieldError(
  fields: DraftField[],
): { fieldId: string; message: CollectionFormsErrorMessage } | null {
  if (fields.length === 0 || fields.length > MAX_FIELDS_PER_FORM) {
    return { fieldId: fields[0]?.id ?? '', message: 'formFieldCountInvalid' };
  }
  const seenMappingKeys = new Set<string>();
  for (const field of fields) {
    const label = field.label.trim();
    if (label.length === 0 || label.length > 200) {
      return { fieldId: field.id, message: 'fieldLabelInvalid' };
    }
    if (field.description.trim().length > 1_000) {
      return { fieldId: field.id, message: 'fieldDescriptionInvalid' };
    }
    if (isChoiceType(field.type)) {
      const options = parseOptions(field.optionsText);
      if (options.length === 0 || options.length > 100) {
        return { fieldId: field.id, message: 'fieldOptionsInvalid' };
      }
      if (new Set(options).size !== options.length) {
        return { fieldId: field.id, message: 'fieldOptionsInvalid' };
      }
    }
    if (field.type === 'file_upload') {
      if (
        field.fileTypes.length === 0 ||
        field.fileMaxFiles < 1 ||
        field.fileMaxFiles > MAX_FILES_PER_FIELD
      ) {
        return { fieldId: field.id, message: 'fieldFileConfigInvalid' };
      }
    }
    const mappingKey = field.mappingKey.trim();
    if (mappingKey.length > 0) {
      if (!canMapType(field.type) || !MAPPING_KEY_PATTERN.test(mappingKey)) {
        return { fieldId: field.id, message: 'fieldMappingKeyInvalid' };
      }
      if (seenMappingKeys.has(mappingKey)) {
        return { fieldId: field.id, message: 'fieldMappingKeyDuplicate' };
      }
      seenMappingKeys.add(mappingKey);
    }
  }
  return null;
}
