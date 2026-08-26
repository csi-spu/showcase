import { evaluateAdminCorrection } from './admin-correction-policy';

const base = {
  academicPeriod: { semester: '1' as const, year: 2569 },
  category: 'course_work' as const,
  description: 'รายละเอียดเดิม',
  links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
  summary: 'สรุปเดิม',
  tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
  title: 'ชื่อเดิม',
  videoLinks: [],
};

describe('Admin correction policy', () => {
  it('normalizes a reason and records only meaningful changed fields and categories', () => {
    expect(
      evaluateAdminCorrection(
        {
          ...base,
          summary: 'สรุปใหม่',
          tags: ['React', 'NestJS'],
          videoLinks: [],
        },
        base,
        '  แก้ไขสรุปและเพิ่มแท็กให้ตรงกับผลงาน  ',
        { currentAcademicYear: 2569, entryYear: 2566 },
      ),
    ).toEqual({
      candidate: {
        ...base,
        summary: 'สรุปใหม่',
        tags: [
          { displayLabel: 'React', normalizedIdentity: 'react' },
          { displayLabel: 'NestJS', normalizedIdentity: 'nestjs' },
        ],
      },
      diff: {
        categories: ['content', 'tags'],
        fields: ['summary', 'tags'],
      },
      isValid: true,
      reason: 'แก้ไขสรุปและเพิ่มแท็กให้ตรงกับผลงาน',
    });
  });

  it.each([
    ['short reason', 'สั้น'],
    ['no changed content', 'เหตุผลที่ยาวเพียงพอสำหรับ audit'],
  ])('rejects %s', (_case, reason) => {
    expect(
      evaluateAdminCorrection(
        {
          ...base,
          tags: ['React'],
          videoLinks: [],
        },
        base,
        reason,
        { currentAcademicYear: 2569, entryYear: 2566 },
      ),
    ).toEqual({ isValid: false });
  });
});
