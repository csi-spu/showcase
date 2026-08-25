import { describe, expect, it } from 'vitest';
import { validateChangeRequest } from './admin-review-validation';

describe('validateChangeRequest', () => {
  it('trims and accepts the exact Change Request form boundary', () => {
    expect(validateChangeRequest(formData())).toEqual({
      expectedRevisionVersion: 3,
      feedback: 'กรุณาตรวจสอบรายละเอียดและแก้ไขให้ชัดเจน',
      idempotencyKey: '78000000-0000-4000-8000-000000000001',
      reason: 'content',
    });
  });

  it.each([
    ['feedback', 'short'],
    ['feedback', 'x'.repeat(2_001)],
    ['reason', 'reject'],
    ['expectedRevisionVersion', '0'],
    ['idempotencyKey', 'not-a-uuid'],
  ])('rejects invalid %s', (field, value) => {
    expect(validateChangeRequest(formData({ [field]: value }))).toBeNull();
  });
});

function formData(overrides: Record<string, string> = {}) {
  const input = new FormData();
  const values = {
    expectedRevisionVersion: '3',
    feedback: '  กรุณาตรวจสอบรายละเอียดและแก้ไขให้ชัดเจน  ',
    idempotencyKey: '78000000-0000-4000-8000-000000000001',
    reason: 'content',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) input.set(key, value);
  return input;
}
