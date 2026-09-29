import { describe, expect, it } from 'vitest';
import {
  validateDeleteItem,
  validateDeletionLogCursor,
  validateDeletionTarget,
  validateRestore,
} from './collection-deletions-validation';

const ID = '70000000-0000-4000-8000-000000000001';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('validateDeletionTarget', () => {
  it('accepts a known kind and a UUID', () => {
    expect(validateDeletionTarget('group', ID)).toEqual({ id: ID, kind: 'group' });
  });

  it('rejects an unknown kind or a malformed id', () => {
    expect(validateDeletionTarget('student', ID)).toBeNull();
    expect(validateDeletionTarget('round', '../rounds')).toBeNull();
  });
});

describe('validateDeleteItem', () => {
  it('trims the typed name', () => {
    expect(validateDeleteItem(formData({ confirmationName: '  กลุ่ม A  ' }))).toEqual({
      confirmationName: 'กลุ่ม A',
    });
  });

  it('rejects a blank or overlong name', () => {
    expect(validateDeleteItem(formData({ confirmationName: '   ' }))).toBeNull();
    expect(validateDeleteItem(formData({ confirmationName: 'ก'.repeat(201) }))).toBeNull();
    expect(validateDeleteItem(new FormData())).toBeNull();
  });
});

describe('validateRestore', () => {
  it('trims the reason', () => {
    expect(validateRestore(ID, formData({ reason: ' ลบผิด ' }))).toEqual({
      deletionId: ID,
      reason: 'ลบผิด',
    });
  });

  it('rejects a blank or overlong reason and a malformed deletion id', () => {
    expect(validateRestore(ID, formData({ reason: '  ' }))).toBeNull();
    expect(validateRestore(ID, formData({ reason: 'ก'.repeat(2_001) }))).toBeNull();
    expect(validateRestore('not-a-uuid', formData({ reason: 'ลบผิด' }))).toBeNull();
  });
});

describe('validateDeletionLogCursor', () => {
  it('accepts the first page and a base64url cursor', () => {
    expect(validateDeletionLogCursor(null)).toEqual({ cursor: null });
    expect(validateDeletionLogCursor('MTc5MDA3MTIwMDEyMzQ1Ng')).toEqual({
      cursor: 'MTc5MDA3MTIwMDEyMzQ1Ng',
    });
  });

  it('rejects anything Core could not have issued', () => {
    expect(validateDeletionLogCursor('a&b=c')).toBeNull();
    expect(validateDeletionLogCursor('')).toBeNull();
    expect(validateDeletionLogCursor(42)).toBeNull();
  });
});
