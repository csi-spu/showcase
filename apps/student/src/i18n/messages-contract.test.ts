import { describe, expect, it } from 'vitest';
import messages from '../../messages/th.json';

describe('Thai Student messages', () => {
  it('explains authentication in language a general Student can understand', () => {
    expect(messages.Auth.kicker).toBe('สำหรับนักศึกษา');
    expect(messages.Auth.login.description).toBe('เข้าสู่ระบบด้วยรหัสนักศึกษาและรหัสผ่านของคุณ');
    expect(messages.Auth.login.privacy).toBe(
      'ข้อมูลเข้าสู่ระบบของคุณใช้สำหรับยืนยันตัวตนเท่านั้น และจะไม่ถูกนำไปแสดงต่อสาธารณะ',
    );
    expect(messages.Auth.expired.heading).toBe('หมดเวลาใช้งาน');
  });

  it('does not expose implementation or project-planning vocabulary', () => {
    const userFacingCopy = JSON.stringify(messages);

    expect(userFacingCopy).not.toMatch(/STUDENT ACCESS|Harness|Phase 1|JavaScript|เซสชัน/);
    expect(messages.Home.description).toBe('พื้นที่สำหรับจัดการโปรไฟล์และผลงานของนักศึกษา');
  });
});
