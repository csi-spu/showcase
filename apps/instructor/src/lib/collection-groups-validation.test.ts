import { describe, expect, it } from 'vitest';
import {
  validateAddByEntryYear,
  validateAddByStudentIds,
  validateCreateGroup,
  validateCreateRound,
  validateWithdraw,
} from './collection-groups-validation';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('validateCreateRound / validateCreateGroup', () => {
  it('trims a valid name and rejects an empty one', () => {
    expect(validateCreateRound(formData({ name: '  รอบทดสอบ  ' }))).toEqual({
      name: 'รอบทดสอบ',
    });
    expect(validateCreateRound(formData({ name: '   ' }))).toBeNull();
    expect(validateCreateGroup(formData({ name: 'กลุ่ม' }))).toEqual({ name: 'กลุ่ม' });
    expect(validateCreateGroup(formData({ name: '' }))).toBeNull();
  });
});

describe('validateAddByStudentIds', () => {
  it('splits on whitespace/commas and drops empty entries', () => {
    expect(
      validateAddByStudentIds(formData({ studentIds: '69000001\n69000002, 69000003  ' })),
    ).toEqual({ studentIds: ['69000001', '69000002', '69000003'] });
  });

  it('rejects a list with a malformed Student ID', () => {
    expect(validateAddByStudentIds(formData({ studentIds: '69000001\n123' }))).toBeNull();
  });

  it('rejects an empty list', () => {
    expect(validateAddByStudentIds(formData({ studentIds: '   ' }))).toBeNull();
  });
});

describe('validateAddByEntryYear', () => {
  it('coerces a numeric string within range', () => {
    expect(validateAddByEntryYear(formData({ entryYear: '2569' }))).toEqual({ entryYear: 2569 });
  });

  it('rejects a year outside the accepted range', () => {
    expect(validateAddByEntryYear(formData({ entryYear: '1999' }))).toBeNull();
  });
});

describe('validateWithdraw', () => {
  it('accepts a valid reason and account id', () => {
    const studentAccountId = '40000000-0000-4000-8000-000000000001';
    expect(
      validateWithdraw(formData({ reason: '  ลาออก  ', studentAccountId })),
    ).toEqual({ reason: 'ลาออก', studentAccountId });
  });

  it('rejects an empty reason or a non-UUID account id', () => {
    expect(
      validateWithdraw(
        formData({ reason: '', studentAccountId: '40000000-0000-4000-8000-000000000001' }),
      ),
    ).toBeNull();
    expect(validateWithdraw(formData({ reason: 'ลาออก', studentAccountId: 'not-a-uuid' }))).toBeNull();
  });
});
