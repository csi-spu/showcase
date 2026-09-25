import { describe, expect, it } from 'vitest';
import {
  buildInitialAnswers,
  findSubmitBlockers,
  isAnswerValid,
  isEmptyAnswer,
} from './collection-answers';
import type { StudentCollectionField } from '@/lib/student-collection-forms-contract';

function field(overrides: Partial<StudentCollectionField> = {}): StudentCollectionField {
  return {
    description: '',
    id: 'field-1',
    label: 'คำถาม',
    required: false,
    type: 'short_text',
    ...overrides,
  };
}

describe('isEmptyAnswer', () => {
  it('treats blank, whitespace, empty lists and absent values as unanswered', () => {
    expect(isEmptyAnswer(undefined)).toBe(true);
    expect(isEmptyAnswer(null)).toBe(true);
    expect(isEmptyAnswer('   ')).toBe(true);
    expect(isEmptyAnswer([])).toBe(true);
  });

  it('treats zero as an answer, because it is one', () => {
    expect(isEmptyAnswer(0)).toBe(false);
  });
});

describe('isAnswerValid while drafting', () => {
  it('accepts an unfinished required field, so autosave never rejects work in progress', () => {
    expect(isAnswerValid(field({ required: true }), '', { isComplete: false })).toBe(true);
  });

  it('rejects the same empty required field at submit time', () => {
    expect(isAnswerValid(field({ required: true }), '', { isComplete: true })).toBe(false);
  });
});

describe('isAnswerValid by field type', () => {
  it('requires a finite number', () => {
    const numberField = field({ type: 'number' });
    expect(isAnswerValid(numberField, 12, { isComplete: true })).toBe(true);
    expect(isAnswerValid(numberField, Number.NaN, { isComplete: true })).toBe(false);
    expect(isAnswerValid(numberField, '12', { isComplete: true })).toBe(false);
  });

  it('requires a real calendar date', () => {
    const dateField = field({ type: 'date' });
    expect(isAnswerValid(dateField, '2026-02-28', { isComplete: true })).toBe(true);
    expect(isAnswerValid(dateField, '2026-02-30', { isComplete: true })).toBe(false);
    expect(isAnswerValid(dateField, '28/02/2026', { isComplete: true })).toBe(false);
  });

  it('only accepts choices the Instructor offered', () => {
    const choiceField = field({ options: ['ก', 'ข'], type: 'single_choice' });
    expect(isAnswerValid(choiceField, 'ก', { isComplete: true })).toBe(true);
    expect(isAnswerValid(choiceField, 'ค', { isComplete: true })).toBe(false);
  });

  it('rejects duplicate or unknown entries in a multiple choice answer', () => {
    const multiField = field({ options: ['ก', 'ข'], type: 'multiple_choice' });
    expect(isAnswerValid(multiField, ['ก', 'ข'], { isComplete: true })).toBe(true);
    expect(isAnswerValid(multiField, ['ก', 'ก'], { isComplete: true })).toBe(false);
    expect(isAnswerValid(multiField, ['ค'], { isComplete: true })).toBe(false);
  });

  it('expects a file field to carry no answer value of its own', () => {
    const fileField = field({ type: 'file_upload' });
    expect(isAnswerValid(fileField, null, { isComplete: true })).toBe(true);
    expect(isAnswerValid(fileField, 'something', { isComplete: true })).toBe(false);
  });
});

describe('findSubmitBlockers', () => {
  it('reports every problem at once rather than stopping at the first', () => {
    const fields = [
      field({ id: 'a', required: true }),
      field({ id: 'b', required: true, type: 'number' }),
      field({ id: 'c', required: true, type: 'file_upload' }),
    ];

    const blockers = findSubmitBlockers(fields, { a: '', b: '' }, {});

    expect(blockers).toEqual([
      { fieldId: 'a', reason: 'required' },
      { fieldId: 'b', reason: 'required' },
      { fieldId: 'c', reason: 'fileRequired' },
    ]);
  });

  it('clears a required file field once a file is attached', () => {
    const fields = [field({ id: 'c', required: true, type: 'file_upload' })];

    expect(findSubmitBlockers(fields, {}, { c: 1 })).toEqual([]);
  });

  it('reports a filled but invalid answer as invalid, not missing', () => {
    const fields = [field({ id: 'd', options: ['ก'], required: true, type: 'single_choice' })];

    expect(findSubmitBlockers(fields, { d: 'ข' }, {})).toEqual([
      { fieldId: 'd', reason: 'invalid' },
    ]);
  });

  it('passes an optional field left blank', () => {
    expect(findSubmitBlockers([field({ id: 'e' })], { e: '' }, {})).toEqual([]);
  });
});

describe('buildInitialAnswers', () => {
  it('prefers a saved draft over a prefill, so the system never overwrites the Student', () => {
    const fields = [field({ id: 'a' })];

    const result = buildInitialAnswers(fields, { a: 'ที่นักศึกษาพิมพ์' }, [
      { fieldId: 'a', value: 'ที่ระบบเติม' },
    ]);

    expect(result.answers.a).toBe('ที่นักศึกษาพิมพ์');
    expect(result.prefilledFieldIds).toEqual([]);
  });

  it('uses a prefill when there is no draft and marks it as system-filled', () => {
    const result = buildInitialAnswers([field({ id: 'a' })], {}, [
      { fieldId: 'a', value: 'ที่ระบบเติม' },
    ]);

    expect(result.answers.a).toBe('ที่ระบบเติม');
    expect(result.prefilledFieldIds).toEqual(['a']);
  });

  it('drops a prefill whose shape does not fit the destination, rather than coercing it', () => {
    const fields = [field({ id: 'a', type: 'number' })];

    const result = buildInitialAnswers(fields, {}, [{ fieldId: 'a', value: 'ไม่ใช่ตัวเลข' }]);

    expect(result.answers.a).toBe('');
  });

  it('clears a draft choice that the Instructor removed', () => {
    const fields = [field({ id: 'choice', options: ['ใหม่'], type: 'single_choice' })];

    const result = buildInitialAnswers(fields, { choice: 'เดิม' }, []);

    expect(result.answers.choice).toBe('');
  });

  it('gives a file field no answer slot at all', () => {
    const result = buildInitialAnswers([field({ id: 'f', type: 'file_upload' })], {}, []);

    expect(result.answers).toEqual({});
  });

  it('starts a multiple choice field as a list so its control is never uncontrolled', () => {
    const result = buildInitialAnswers(
      [field({ id: 'm', options: ['ก'], type: 'multiple_choice' })],
      {},
      [],
    );

    expect(result.answers.m).toEqual([]);
  });
});
