import { describe, expect, it } from 'vitest';
import messages from '../../messages/th.json';

describe('Thai Student-collection messages', () => {
  it('explains authentication in language a Student can understand', () => {
    expect(messages.Auth.kicker).toBe('สำหรับนักศึกษา');
    expect(messages.Auth.login.studentId).toBe('รหัสนักศึกษา');
    expect(messages.Auth.expired.heading).toBe('หมดเวลาใช้งาน');
  });

  it('does not expose implementation or project-planning vocabulary', () => {
    const userFacingCopy = JSON.stringify(messages);

    expect(userFacingCopy).not.toMatch(
      /Harness|Phase 1|JavaScript|เซสชัน|บริการยืนยันตัวตน|ช่องทางปฏิบัติการ/,
    );
  });
});
