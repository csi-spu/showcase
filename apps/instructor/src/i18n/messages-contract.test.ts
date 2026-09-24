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
    expect(userFacingCopy).not.toContain('รอบ');
  });

  it('presents form creation before group setup while preserving the existing flow', () => {
    expect(messages.Nav.createForm).toBe('สร้างแบบฟอร์ม');
    expect(messages.Nav.createFormHint).toBe('เลือกกลุ่ม หรือสร้างกลุ่มใหม่หากยังไม่มี');
    expect(messages.Dashboard.createForm).toBe('สร้างแบบฟอร์ม');
    expect(messages.Forms.createFlow.description).toBe(
      'เลือกกลุ่มที่จะใช้แบบฟอร์ม หากยังไม่มี สร้างกลุ่มและชุดงานได้ที่นี่',
    );
    expect(messages.Groups.round.pageDescription).toBe(
      'สร้างแบบฟอร์มโดยเลือกกลุ่มก่อน หากยังไม่มีกลุ่ม สร้างกลุ่มและชุดงานได้ในขั้นตอนเดียว',
    );
    expect(messages.Groups.group.listDescription).toBe(
      'เลือกกลุ่มที่ต้องการสร้างหรือจัดการแบบฟอร์ม',
    );
    expect(messages.Groups.group.emptyDescription).toBe(
      'ยังไม่มีกลุ่มสำหรับแบบฟอร์มนี้ สร้างกลุ่มแรก แล้วจึงสร้างแบบฟอร์มภายในกลุ่ม',
    );
  });

  it('names the owning program in the sidebar', () => {
    expect(messages.Nav.brandSubtitle).toBe('สาขาวิทยาการคอมพิวเตอร์และนวัตกรรมการพัฒนาซอฟต์แวร์');
  });

  it('uses concise collection-set labels on the decorated list page', () => {
    expect(messages.Groups.round.listTitle).toBe('ชุดงานของคุณ');
    expect(messages.Groups.round.statClosed).toBe('ชุดงานที่ปิดแล้ว');
    expect(messages.Groups.round.filterAll).toBe('ทั้งหมด');
  });
});
