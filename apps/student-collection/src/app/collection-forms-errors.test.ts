import { describe, expect, it } from 'vitest';
import { toErrorMessage } from './collection-forms-errors';

describe('toErrorMessage', () => {
  it('tells the Student a deleted form is gone, apart from a missing field or file', () => {
    expect(toErrorMessage('FORM_NOT_FOUND')).toBe('formNotFound');
    expect(toErrorMessage('FIELD_NOT_FOUND')).toBe('notFound');
    expect(toErrorMessage('FILE_NOT_ACCESSIBLE')).toBe('notFound');
  });

  it('reads an unknown code as an outage', () => {
    expect(toErrorMessage('SOMETHING_NEW')).toBe('unavailable');
  });
});
