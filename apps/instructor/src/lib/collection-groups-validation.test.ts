import { describe, expect, it } from 'vitest';
import {
  validateAddMembers,
  validateCreateGroup,
  validateCreateFormGroup,
  validateCreateRound,
  validateResolveStudentIds,
  validateSelectAllQuery,
  validateStudentListQuery,
  validateWithdraw,
} from './collection-groups-validation';

const IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000001';
const MEMBER_ONE = '40000000-0000-4000-8000-000000000001';
const MEMBER_TWO = '40000000-0000-4000-8000-000000000002';
const MEMBERS = JSON.stringify([MEMBER_ONE, MEMBER_TWO]);

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
    expect(
      validateCreateGroup(
        formData({ idempotencyKey: IDEMPOTENCY_KEY, memberAccountIds: MEMBERS, name: 'กลุ่ม' }),
      ),
    ).toEqual({
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: [MEMBER_ONE, MEMBER_TWO],
      name: 'กลุ่ม',
    });
    expect(
      validateCreateGroup(
        formData({ idempotencyKey: IDEMPOTENCY_KEY, memberAccountIds: MEMBERS, name: '' }),
      ),
    ).toBeNull();
  });

  it('requires an idempotency key and at least one member', () => {
    expect(validateCreateGroup(formData({ memberAccountIds: MEMBERS, name: 'กลุ่ม' }))).toBeNull();
    expect(
      validateCreateGroup(
        formData({ idempotencyKey: IDEMPOTENCY_KEY, memberAccountIds: '[]', name: 'กลุ่ม' }),
      ),
    ).toBeNull();
  });
});

describe('validateCreateFormGroup', () => {
  it('accepts an existing Round and trims the Group name', () => {
    expect(
      validateCreateFormGroup(
        formData({
          groupName: '  กลุ่ม 1  ',
          idempotencyKey: IDEMPOTENCY_KEY,
          memberAccountIds: MEMBERS,
          mode: 'existing-round',
          roundId: '20000000-0000-4000-8000-000000000001',
        }),
      ),
    ).toEqual({
      groupName: 'กลุ่ม 1',
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: [MEMBER_ONE, MEMBER_TWO],
      mode: 'existing-round',
      roundId: '20000000-0000-4000-8000-000000000001',
    });
  });

  it('requires both names and members when creating the first Round and Group', () => {
    const valid = {
      groupName: '  กลุ่ม 1 ',
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: MEMBERS,
      mode: 'new-round',
      roundName: ' รอบ 1 ',
    };
    expect(validateCreateFormGroup(formData(valid))).toEqual({
      groupName: 'กลุ่ม 1',
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: [MEMBER_ONE, MEMBER_TWO],
      mode: 'new-round',
      roundName: 'รอบ 1',
    });
    expect(validateCreateFormGroup(formData({ ...valid, roundName: '   ' }))).toBeNull();
    expect(validateCreateFormGroup(formData({ ...valid, memberAccountIds: '[]' }))).toBeNull();
  });
});

describe('validateAddMembers', () => {
  it('parses the selected Account IDs', () => {
    expect(validateAddMembers(formData({ memberAccountIds: MEMBERS }))).toEqual({
      memberAccountIds: [MEMBER_ONE, MEMBER_TWO],
    });
  });

  it('rejects malformed JSON, non-UUID entries, duplicates, and more than 2,000 members', () => {
    for (const memberAccountIds of [
      '[',
      '"x"',
      JSON.stringify(['69000001']),
      JSON.stringify([MEMBER_ONE, MEMBER_ONE]),
      JSON.stringify(
        Array.from(
          { length: 2_001 },
          (_, index) => `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ),
      ),
    ]) {
      expect(validateAddMembers(formData({ memberAccountIds }))).toBeNull();
    }
    expect(validateAddMembers(new FormData())).toBeNull();
  });
});

describe('student selection reads', () => {
  it('normalizes an empty name query and bounds the filter', () => {
    expect(
      validateStudentListQuery({ cursor: null, entryYear: 2569, groupId: null, q: '  ' }),
    ).toEqual({ cursor: null, entryYear: 2569, groupId: null, q: null });
    expect(
      validateStudentListQuery({ cursor: 'a/b', entryYear: null, groupId: null, q: null }),
    ).toBeNull();
    expect(
      validateStudentListQuery({ cursor: null, entryYear: 1999, groupId: null, q: null }),
    ).toBeNull();
    expect(
      validateSelectAllQuery({ entryYear: null, groupId: null, q: 'สม', selectedCount: 2_001 }),
    ).toBeNull();
  });

  it('accepts up to 500 eight-digit Student IDs per resolve', () => {
    expect(validateResolveStudentIds({ groupId: null, studentIds: ['69000001'] })).toEqual({
      groupId: null,
      studentIds: ['69000001'],
    });
    expect(validateResolveStudentIds({ groupId: null, studentIds: ['6900001'] })).toBeNull();
    expect(
      validateResolveStudentIds({
        groupId: null,
        studentIds: Array.from({ length: 501 }, () => '69000001'),
      }),
    ).toBeNull();
  });
});

describe('validateWithdraw', () => {
  it('accepts a valid reason and account id', () => {
    const studentAccountId = '40000000-0000-4000-8000-000000000001';
    expect(validateWithdraw(formData({ reason: '  ลาออก  ', studentAccountId }))).toEqual({
      reason: 'ลาออก',
      studentAccountId,
    });
  });

  it('rejects an empty reason or a non-UUID account id', () => {
    expect(
      validateWithdraw(
        formData({ reason: '', studentAccountId: '40000000-0000-4000-8000-000000000001' }),
      ),
    ).toBeNull();
    expect(
      validateWithdraw(formData({ reason: 'ลาออก', studentAccountId: 'not-a-uuid' })),
    ).toBeNull();
  });
});
