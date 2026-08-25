import { describe, expect, it } from 'vitest';
import { validateRosterConflictResolution } from './roster-conflict-validation';

describe('validateRosterConflictResolution', () => {
  it('requires a reason before accepting an incoming name', () => {
    const formData = resolutionFormData('accept_incoming_name');
    formData.set('reason', '   ');

    expect(validateRosterConflictResolution(formData)).toBe('reasonRequired');
  });

  it('trims a valid optimistic resolution payload', () => {
    const formData = resolutionFormData('accept_incoming_name');
    formData.set('reason', ' ตรวจสอบกับทะเบียนแล้ว ');

    expect(validateRosterConflictResolution(formData)).toEqual({
      batchId: '20000000-0000-4000-8000-000000000001',
      conflictId: '30000000-0000-4000-8000-000000000001',
      expectedVersion: 1,
      idempotencyKey: '40000000-0000-4000-8000-000000000001',
      reason: 'ตรวจสอบกับทะเบียนแล้ว',
      resolution: 'accept_incoming_name',
    });
  });
});

function resolutionFormData(resolution: string): FormData {
  const formData = new FormData();
  formData.set('batchId', '20000000-0000-4000-8000-000000000001');
  formData.set('conflictId', '30000000-0000-4000-8000-000000000001');
  formData.set('expectedVersion', '1');
  formData.set('idempotencyKey', '40000000-0000-4000-8000-000000000001');
  formData.set('resolution', resolution);
  return formData;
}
