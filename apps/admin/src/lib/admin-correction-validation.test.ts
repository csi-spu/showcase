import { describe, expect, it } from 'vitest';
import { validateAdminCorrection } from './admin-correction-validation';

describe('validateAdminCorrection', () => {
  it('normalizes the complete editable Work content and audit reason', () => {
    expect(validateAdminCorrection(formData())).toEqual({
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดที่แก้ไข',
      expectedPublishedRevisionId: id(1),
      expectedRevisionVersion: 2,
      idempotencyKey: id(2),
      links: [{ label: 'เว็บไซต์ | เอกสาร', url: 'https://example.com/' }],
      reason: 'แก้ไขข้อมูลที่คลาดเคลื่อนจากผลงานจริง',
      summary: 'สรุปที่แก้ไข',
      tags: ['React, TypeScript', 'NestJS'],
      title: 'ชื่อที่แก้ไข',
      videoLinks: ['https://www.youtube.com/watch?v=abcdefghijk'],
    });
  });

  it.each([
    ['reason', 'สั้น'],
    ['expectedRevisionVersion', '0'],
    ['expectedPublishedRevisionId', 'bad'],
    ['linkUrl', 'http://example.com'],
    ['tag', 'x'.repeat(51)],
    ['videoLink', 'http://example.com/video'],
  ])('rejects invalid %s', (field, value) => {
    expect(validateAdminCorrection(formData({ [field]: value }))).toBeNull();
  });
});

function formData(overrides: Record<string, string> = {}) {
  const input = new FormData();
  const values = {
    academicYear: '2569',
    category: 'course_work',
    description: '  รายละเอียดที่แก้ไข  ',
    expectedPublishedRevisionId: id(1),
    expectedRevisionVersion: '2',
    idempotencyKey: id(2),
    reason: '  แก้ไขข้อมูลที่คลาดเคลื่อนจากผลงานจริง  ',
    semester: '1',
    summary: '  สรุปที่แก้ไข  ',
    title: '  ชื่อที่แก้ไข  ',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (!['linkUrl', 'tag', 'videoLink'].includes(key)) input.set(key, value);
  }
  input.append('linkLabel', 'เว็บไซต์ | เอกสาร');
  input.append('linkUrl', overrides.linkUrl ?? 'https://example.com/');
  input.append('tag', overrides.tag ?? 'React, TypeScript');
  input.append('tag', 'NestJS');
  input.append('videoLink', overrides.videoLink ?? 'https://www.youtube.com/watch?v=abcdefghijk');
  return input;
}

function id(value: number): string {
  return `93000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
