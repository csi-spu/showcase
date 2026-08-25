import { describe, expect, it } from 'vitest';
import {
  validateAcademicYearUpdate,
  validateStudentAccountOperation,
} from './account-controls-validation';

const IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '20000000-0000-4000-8000-000000000001';

describe('Admin Account control validation', () => {
  it('accepts a bounded Buddhist Current Academic Year mutation', () => {
    expect(
      validateAcademicYearUpdate(
        new FormDataBuilder()
          .set('currentAcademicYear', '2570')
          .set('expectedVersion', '2')
          .set('idempotencyKey', IDEMPOTENCY_KEY).value,
      ),
    ).toEqual({ currentAcademicYear: 2570, expectedVersion: 2, idempotencyKey: IDEMPOTENCY_KEY });
  });

  it.each(['6900000', '๖๙๐๐๐๐๐๑', '69000001x'])('rejects invalid Student ID %s', (studentId) => {
    expect(
      validateStudentAccountOperation(
        new FormDataBuilder().set('operation', 'lookup').set('studentId', studentId).value,
      ),
    ).toBeNull();
  });

  it('normalizes a required extension reason and validates optimistic fields', () => {
    expect(
      validateStudentAccountOperation(
        new FormDataBuilder()
          .set('operation', 'extend')
          .set('studentAccountId', ACCOUNT_ID)
          .set('expectedVersion', '2')
          .set('idempotencyKey', IDEMPOTENCY_KEY)
          .set('accessEndsAcademicYear', '2578')
          .set('reason', '  อนุมัติตามทะเบียน  ').value,
      ),
    ).toEqual({
      accessEndsAcademicYear: 2578,
      expectedVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      operation: 'extend',
      reason: 'อนุมัติตามทะเบียน',
      studentAccountId: ACCOUNT_ID,
    });
  });
});

class FormDataBuilder {
  readonly value = new FormData();

  set(name: string, value: string): this {
    this.value.set(name, value);
    return this;
  }
}
