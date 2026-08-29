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
    const userFacingCopy = collectStrings(messages).join(' ');

    expect(userFacingCopy).not.toMatch(
      /STUDENT ACCESS|Harness|Phase 1|JavaScript|เซสชัน|Revision|Review|snapshot|rebase|Work Draft/,
    );
    expect(messages.Home.description).toBe('จัดการโปรไฟล์และผลงานของนักศึกษา');
  });

  it('uses direct dashboard copy', () => {
    expect(messages.Dashboard.title).toBe('จัดการผลงานของคุณ');
    expect(messages.Dashboard.description).toBe('ติดตามสถานะผลงานและไปยังงานที่ต้องทำต่อ');
    expect(messages.Auth.active.createWork).toBe('อัปโหลดผลงาน');
    expect(messages.Workspace.navigation.addWork).toBe('เพิ่มผลงาน');
    expect(messages.WorkPage.createHeading).toBe('อัปโหลดผลงาน');
  });

  it('provides the authenticated Student identity copy used by the sidebar', () => {
    expect(messages.Workspace.profile.entryYear).toBe('ปีที่เข้าศึกษา {year}');
    expect(messages.Workspace.profile.fallback).toBe('ยังไม่ได้ตั้งค่าโปรไฟล์');
    expect(messages.Workspace.profile.photoAlt).toBe('รูปโปรไฟล์ของ {name}');
  });
});

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}
