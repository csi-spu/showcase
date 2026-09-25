import {
  findAnswerError,
  findFieldDefinitionError,
  findFieldTransitionError,
  isAnswerValid,
  reconcileDraftAnswers,
  type CollectionField,
} from './collection-field';

function field(overrides: Partial<CollectionField> & Pick<CollectionField, 'id' | 'type'>) {
  return { description: '', label: 'คำถาม', required: false, ...overrides };
}

describe('collection field definitions', () => {
  it('accepts every supported field type', () => {
    const fields: CollectionField[] = [
      field({ id: 'a', type: 'short_text' }),
      field({ id: 'b', type: 'long_text' }),
      field({ id: 'c', type: 'number' }),
      field({ id: 'd', type: 'date' }),
      field({ id: 'e', options: ['x', 'y'], type: 'single_choice' }),
      field({ id: 'f', options: ['x', 'y'], type: 'multiple_choice' }),
      field({
        file: { allowedFileTypes: ['pdf'], maxFiles: 3 },
        id: 'g',
        type: 'file_upload',
      }),
    ];
    expect(findFieldDefinitionError(fields)).toBeNull();
  });

  it('reports the offending field so the builder can show the error in place', () => {
    const fields = [
      field({ id: 'ok', type: 'short_text' }),
      field({ id: 'bad', label: '  ', type: 'short_text' }),
    ];
    expect(findFieldDefinitionError(fields)).toEqual({
      code: 'FIELD_LABEL_INVALID',
      fieldId: 'bad',
    });
  });

  it('rejects duplicate field identifiers', () => {
    const duplicate = field({ id: 'same', type: 'short_text' });
    expect(findFieldDefinitionError([duplicate, duplicate])).toEqual({
      code: 'FIELD_ID_INVALID',
      fieldId: 'same',
    });
  });

  it('requires choices on choice fields and forbids them elsewhere', () => {
    expect(findFieldDefinitionError([field({ id: 'c', type: 'single_choice' })])).toEqual({
      code: 'FIELD_OPTIONS_INVALID',
      fieldId: 'c',
    });
    expect(
      findFieldDefinitionError([field({ id: 't', options: ['x'], type: 'short_text' })]),
    ).toEqual({ code: 'FIELD_OPTIONS_UNEXPECTED', fieldId: 't' });
  });

  it('rejects duplicate and blank choices', () => {
    expect(
      findFieldDefinitionError([field({ id: 'c', options: ['x', 'x'], type: 'single_choice' })]),
    ).toEqual({ code: 'FIELD_OPTIONS_INVALID', fieldId: 'c' });
    expect(
      findFieldDefinitionError([field({ id: 'c', options: ['x', ' '], type: 'single_choice' })]),
    ).toEqual({ code: 'FIELD_OPTIONS_INVALID', fieldId: 'c' });
  });

  it('bounds file configuration to the platform ceiling', () => {
    expect(
      findFieldDefinitionError([
        field({ file: { allowedFileTypes: ['pdf'], maxFiles: 6 }, id: 'f', type: 'file_upload' }),
      ]),
    ).toEqual({ code: 'FIELD_FILE_CONFIG_INVALID', fieldId: 'f' });
    expect(
      findFieldDefinitionError([
        field({ file: { allowedFileTypes: [], maxFiles: 1 }, id: 'f', type: 'file_upload' }),
      ]),
    ).toEqual({ code: 'FIELD_FILE_CONFIG_INVALID', fieldId: 'f' });
  });

  it('refuses a mapping key on a file field, because files are never reused', () => {
    expect(
      findFieldDefinitionError([
        field({
          file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
          id: 'f',
          mappingKey: 'transcript',
          type: 'file_upload',
        }),
      ]),
    ).toEqual({ code: 'FIELD_MAPPING_KEY_INVALID', fieldId: 'f' });
  });

  it('refuses two fields claiming the same mapping key', () => {
    expect(
      findFieldDefinitionError([
        field({ id: 'a', mappingKey: 'company_name', type: 'short_text' }),
        field({ id: 'b', mappingKey: 'company_name', type: 'short_text' }),
      ]),
    ).toEqual({ code: 'FIELD_MAPPING_KEY_DUPLICATE', fieldId: 'b' });
  });
});

describe('collection answer validation', () => {
  it('allows an empty required field while drafting but not at submission', () => {
    const required = field({ id: 'a', required: true, type: 'short_text' });
    expect(isAnswerValid(required, '', { isComplete: false })).toBe(true);
    expect(isAnswerValid(required, '', { isComplete: true })).toBe(false);
    expect(isAnswerValid(required, 'ok', { isComplete: true })).toBe(true);
  });

  it('treats whitespace as empty so spaces cannot satisfy a required field', () => {
    const required = field({ id: 'a', required: true, type: 'short_text' });
    expect(isAnswerValid(required, '   ', { isComplete: true })).toBe(false);
  });

  it('validates numbers, dates, and choices by type', () => {
    expect(isAnswerValid(field({ id: 'n', type: 'number' }), 12, { isComplete: true })).toBe(true);
    expect(isAnswerValid(field({ id: 'n', type: 'number' }), '12', { isComplete: true })).toBe(
      false,
    );
    expect(
      isAnswerValid(field({ id: 'd', type: 'date' }), '2026-09-22', { isComplete: true }),
    ).toBe(true);
    expect(
      isAnswerValid(field({ id: 'd', type: 'date' }), '2026-02-31', { isComplete: true }),
    ).toBe(false);
    const choice = field({ id: 'c', options: ['x', 'y'], type: 'single_choice' });
    expect(isAnswerValid(choice, 'x', { isComplete: true })).toBe(true);
    expect(isAnswerValid(choice, 'z', { isComplete: true })).toBe(false);
  });

  it('rejects multiple choice answers with unknown or repeated entries', () => {
    const multi = field({ id: 'm', options: ['x', 'y'], type: 'multiple_choice' });
    expect(isAnswerValid(multi, ['x', 'y'], { isComplete: true })).toBe(true);
    expect(isAnswerValid(multi, ['x', 'x'], { isComplete: true })).toBe(false);
    expect(isAnswerValid(multi, ['x', 'z'], { isComplete: true })).toBe(false);
  });

  it('keeps file answers out of the answers map entirely', () => {
    const upload = field({
      file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
      id: 'f',
      required: true,
      type: 'file_upload',
    });
    expect(isAnswerValid(upload, undefined, { isComplete: true })).toBe(true);
    expect(isAnswerValid(upload, 'something.pdf', { isComplete: true })).toBe(false);
  });

  it('rejects answers addressed to fields the form does not define', () => {
    const fields = [field({ id: 'known', type: 'short_text' })];
    expect(findAnswerError(fields, { unknown: 'x' }, { isComplete: false })).toEqual({
      code: 'ANSWER_FIELD_UNKNOWN',
      fieldId: 'unknown',
    });
  });

  it('names the first invalid field for submission errors', () => {
    const fields = [
      field({ id: 'a', required: true, type: 'short_text' }),
      field({ id: 'b', required: true, type: 'number' }),
    ];
    expect(findAnswerError(fields, { a: 'ok' }, { isComplete: true })).toEqual({
      code: 'ANSWER_INVALID',
      fieldId: 'b',
    });
  });
});

describe('collection form schema changes', () => {
  it('requires a new field identifier when the answer type changes', () => {
    const previous = [field({ id: 'company', type: 'short_text' })];
    const next = [field({ id: 'company', type: 'number' })];

    expect(findFieldTransitionError(previous, next)).toEqual({
      code: 'FIELD_TYPE_CHANGE_REQUIRES_NEW_ID',
      fieldId: 'company',
    });
  });

  it('allows labels, choices, requirements, order, additions, and removals to change', () => {
    const previous = [
      field({ id: 'choice', options: ['เดิม'], type: 'single_choice' }),
      field({ id: 'removed', type: 'short_text' }),
    ];
    const next = [
      field({ id: 'added', type: 'date' }),
      field({
        id: 'choice',
        label: 'คำถามใหม่',
        options: ['ใหม่'],
        required: true,
        type: 'single_choice',
      }),
    ];

    expect(findFieldTransitionError(previous, next)).toBeNull();
  });

  it('drops removed and incompatible draft answers without changing compatible values', () => {
    const fields = [
      field({ id: 'company', type: 'short_text' }),
      field({ id: 'choice', options: ['ใหม่'], type: 'single_choice' }),
      field({ id: 'multiple', options: ['a', 'b'], type: 'multiple_choice' }),
    ];

    expect(
      reconcileDraftAnswers(fields, {
        choice: 'เดิม',
        company: 'บริษัท ก',
        multiple: ['a', 'เลิกใช้'],
        removed: 'ไม่ควรอยู่',
      }),
    ).toEqual({ company: 'บริษัท ก' });
  });
});
