import { describe, expect, it } from 'vitest';
import {
  canMapType,
  createDraftField,
  findDraftFieldError,
  toDraftField,
  toFieldPayload,
  toFormsErrorMessage,
  type DraftField,
} from './collection-forms-state';

function draft(overrides: Partial<DraftField> = {}): DraftField {
  return { ...createDraftField('f1'), label: 'คำถาม', ...overrides };
}

describe('toFormsErrorMessage', () => {
  it('maps the lifecycle codes the builder can provoke', () => {
    expect(toFormsErrorMessage('FORM_STRUCTURE_LOCKED')).toBe('formStructureLocked');
    expect(toFormsErrorMessage('FORM_ALREADY_OPENED')).toBe('formStructureLocked');
    expect(toFormsErrorMessage('DEADLINE_NOT_EXTENDABLE')).toBe('deadlineNotExtendable');
    expect(toFormsErrorMessage('TEMPLATE_NOT_FOUND')).toBe('templateNotFound');
    expect(toFormsErrorMessage('FIELD_MAPPING_KEY_DUPLICATE')).toBe('fieldMappingKeyDuplicate');
  });

  it('distinguishes a form that cannot be closed from one that cannot be reopened', () => {
    expect(toFormsErrorMessage('FORM_NOT_OPEN')).toBe('formNotOpen');
    expect(toFormsErrorMessage('FORM_NOT_CLOSED')).toBe('formNotClosed');
  });

  it('treats both reason failures as one message, since the field is the same', () => {
    expect(toFormsErrorMessage('REASON_REQUIRED')).toBe('reasonRequired');
    expect(toFormsErrorMessage('REASON_TOO_LONG')).toBe('reasonRequired');
  });

  /*
   * Losing the race to another Instructor is not a refusal: the round reached
   * the state that was asked for, so the message points at a stale page.
   */
  it('maps both round race outcomes to a stale-page message', () => {
    expect(toFormsErrorMessage('ROUND_ALREADY_CLOSED')).toBe('roundAlreadyInState');
    expect(toFormsErrorMessage('ROUND_ALREADY_ACTIVE')).toBe('roundAlreadyInState');
    expect(toFormsErrorMessage('ROUND_NOT_FOUND')).toBe('roundNotFound');
  });

  it('falls back to a general message for an unrecognised code', () => {
    expect(toFormsErrorMessage('SOMETHING_NEW')).toBe('unavailable');
  });
});

describe('canMapType', () => {
  it('refuses a mapping key on a file field because every form needs its own upload', () => {
    expect(canMapType('file_upload')).toBe(false);
    expect(canMapType('short_text')).toBe(true);
    expect(canMapType('date')).toBe(true);
  });
});

describe('toFieldPayload', () => {
  it('omits options and file config that do not belong to the chosen type', () => {
    const payload = toFieldPayload(draft({ optionsText: 'ก\nข', type: 'short_text' }));
    expect(payload.options).toBeUndefined();
    expect(payload.file).toBeUndefined();
  });

  it('sends options only for a choice field, trimmed and without blank lines', () => {
    const payload = toFieldPayload(draft({ optionsText: ' ก \n\n ข \n', type: 'single_choice' }));
    expect(payload.options).toEqual(['ก', 'ข']);
  });

  it('sends file config only for a file field', () => {
    const payload = toFieldPayload(
      draft({ fileMaxFiles: 3, fileTypes: ['pdf', 'png'], type: 'file_upload' }),
    );
    expect(payload.file).toEqual({ allowedFileTypes: ['pdf', 'png'], maxFiles: 3 });
  });

  it('drops a mapping key left over from a type that can no longer carry one', () => {
    const payload = toFieldPayload(draft({ mappingKey: 'company', type: 'file_upload' }));
    expect(payload.mappingKey).toBeUndefined();
  });

  it('keeps a mapping key on a field type that supports it', () => {
    expect(toFieldPayload(draft({ mappingKey: ' company ' })).mappingKey).toBe('company');
  });
});

describe('findDraftFieldError', () => {
  it('accepts a well-formed set of fields', () => {
    expect(findDraftFieldError([draft()])).toBeNull();
  });

  it('requires at least one field', () => {
    expect(findDraftFieldError([])?.message).toBe('formFieldCountInvalid');
  });

  it('reports a blank label against the field that carries it', () => {
    const fields = [draft({ id: 'a' }), draft({ id: 'b', label: '   ' })];
    expect(findDraftFieldError(fields)).toEqual({
      fieldId: 'b',
      message: 'fieldLabelInvalid',
    });
  });

  it('requires options on a choice field', () => {
    const error = findDraftFieldError([draft({ optionsText: '', type: 'single_choice' })]);
    expect(error?.message).toBe('fieldOptionsInvalid');
  });

  it('rejects duplicate options', () => {
    const error = findDraftFieldError([draft({ optionsText: 'ก\nก', type: 'multiple_choice' })]);
    expect(error?.message).toBe('fieldOptionsInvalid');
  });

  it('requires at least one allowed file type', () => {
    const error = findDraftFieldError([draft({ fileTypes: [], type: 'file_upload' })]);
    expect(error?.message).toBe('fieldFileConfigInvalid');
  });

  it('caps the file count at the platform limit', () => {
    const error = findDraftFieldError([draft({ fileMaxFiles: 6, type: 'file_upload' })]);
    expect(error?.message).toBe('fieldFileConfigInvalid');
  });

  it('rejects a mapping key that is not a valid key', () => {
    const error = findDraftFieldError([draft({ mappingKey: 'Company Name' })]);
    expect(error?.message).toBe('fieldMappingKeyInvalid');
  });

  it('rejects the same mapping key used twice', () => {
    const fields = [
      draft({ id: 'a', mappingKey: 'company' }),
      draft({ id: 'b', mappingKey: 'company' }),
    ];
    expect(findDraftFieldError(fields)).toEqual({
      fieldId: 'b',
      message: 'fieldMappingKeyDuplicate',
    });
  });

  it('allows the same mapping key on one field only once it is freed', () => {
    const fields = [draft({ id: 'a', mappingKey: 'company' }), draft({ id: 'b' })];
    expect(findDraftFieldError(fields)).toBeNull();
  });
});

describe('toDraftField', () => {
  it('round-trips a Core field into the builder shape', () => {
    const field = toDraftField({
      description: 'อธิบาย',
      file: { allowedFileTypes: ['pdf'], maxFiles: 2 },
      id: 'doc',
      label: 'เอกสาร',
      required: true,
      type: 'file_upload',
    });
    expect(field.fileMaxFiles).toBe(2);
    expect(field.fileTypes).toEqual(['pdf']);
    expect(field.mappingKey).toBe('');
  });

  it('joins choice options into the one-per-line editor value', () => {
    const field = toDraftField({
      description: '',
      id: 'pick',
      label: 'เลือก',
      options: ['ก', 'ข'],
      required: false,
      type: 'single_choice',
    });
    expect(field.optionsText).toBe('ก\nข');
  });
});
