import { describe, expect, it } from 'vitest';
import messages from '../../messages/th.json';

describe('Thai Instructor messages', () => {
  it('explains authentication in language an Instructor can understand', () => {
    expect(messages.Auth.kicker).toBe('สำหรับผู้สอน');
    expect(messages.Auth.login.instructorLogin).toBe('ชื่อผู้ใช้');
    expect(messages.Auth.expired.heading).toBe('หมดเวลาใช้งาน');
  });

  it('does not expose implementation or project-planning vocabulary', () => {
    const userFacingCopy = JSON.stringify(messages);

    expect(userFacingCopy).not.toMatch(
      /Harness|Phase 1|JavaScript|เซสชัน|บริการยืนยันตัวตน|ช่องทางปฏิบัติการ/,
    );
  });
});
