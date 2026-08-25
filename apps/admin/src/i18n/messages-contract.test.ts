import { describe, expect, it } from 'vitest';
import messages from '../../messages/th.json';

describe('Thai Admin messages', () => {
  it('explains authentication in language a general Admin can understand', () => {
    expect(messages.Auth.kicker).toBe('สำหรับผู้ดูแลระบบ');
    expect(messages.Auth.login.description).toBe(
      'เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่คุณได้รับ',
    );
    expect(messages.Auth.login.privacy).toBe(
      'ข้อมูลเข้าสู่ระบบของคุณใช้สำหรับยืนยันตัวตนเท่านั้น และจะไม่ถูกนำไปแสดงต่อสาธารณะ',
    );
    expect(messages.Auth.expired.heading).toBe('หมดเวลาใช้งาน');
  });

  it('does not expose implementation or project-planning vocabulary', () => {
    const userFacingCopy = JSON.stringify(messages);

    expect(userFacingCopy).not.toMatch(
      /ADMIN ACCESS|Harness|Phase 1|JavaScript|เซสชัน|บริการยืนยันตัวตน|ช่องทางปฏิบัติการ/,
    );
    expect(messages.Home.description).toBe('พื้นที่สำหรับตรวจสอบและจัดการผลงานของนักศึกษา');
  });
});
