import { describe, expect, it } from 'vitest';
import { validateWorkForm } from './student-work-validation';

const IDEMPOTENCY_KEY = '64000000-0000-4000-8000-000000000002';

describe('validateWorkForm', () => {
  it('normalizes the complete generic Work Draft form', () => {
    const form = validForm();
    form.set('title', '  ระบบแนะนำผลงาน  ');
    form.set('linkLabel0', ' เว็บไซต์ ');
    form.set('linkUrl0', 'https://example.com');
    form.set('tag0', '  Ｒｅａｃｔ   WEB  ');

    expect(validateWorkForm(form, { currentAcademicYear: 2569, entryYear: 2566 })).toEqual({
      data: {
        academicPeriod: { semester: '1', year: 2569 },
        category: 'course_work',
        description: 'รายละเอียดผลงาน',
        idempotencyKey: IDEMPOTENCY_KEY,
        links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
        summary: 'สรุปผลงาน',
        tags: ['React WEB'],
        title: 'ระบบแนะนำผลงาน',
      },
      success: true,
    });
  });

  it.each([
    ['title', (form: FormData) => form.set('title', ' ')],
    ['summary', (form: FormData) => form.set('summary', 'ก'.repeat(301))],
    ['description', (form: FormData) => form.set('description', '')],
    ['academicPeriod', (form: FormData) => form.set('academicYear', '2565')],
    ['category', (form: FormData) => form.set('category', 'course_specific')],
    ['links', (form: FormData) => form.set('linkUrl0', 'http://example.com')],
    [
      'links',
      (form: FormData) => {
        form.set('linkLabel0', 'เว็บไซต์');
        form.set('linkUrl0', `https://example.com/${'ก'.repeat(700)}`);
      },
    ],
    [
      'tags',
      (form: FormData) => {
        form.set('tag0', 'Ｒｅａｃｔ');
        form.set('tag1', 'react');
      },
    ],
  ])('returns Thai-addressable field %s for invalid input', (field, mutate) => {
    const form = validForm();
    mutate(form);
    const result = validateWorkForm(form, { currentAcademicYear: 2569, entryYear: 2566 });
    expect(result).toEqual({ fieldErrors: [field], success: false });
  });

  it('rejects Tags that collide under full Unicode case folding', () => {
    const form = validForm();
    form.set('tag0', 'Straße');
    form.set('tag1', 'STRASSE');

    expect(validateWorkForm(form, { currentAcademicYear: 2569, entryYear: 2566 })).toEqual({
      fieldErrors: ['tags'],
      success: false,
    });
  });

  it('rejects unknown or repeated form fields at the Server Action boundary', () => {
    const unknown = validForm();
    unknown.set('studentId', '69000001');
    expect(validateWorkForm(unknown, { currentAcademicYear: 2569, entryYear: 2566 })).toEqual({
      fieldErrors: ['form'],
      success: false,
    });

    const repeated = validForm();
    repeated.append('title', 'ข้อมูลแทรก');
    expect(validateWorkForm(repeated, { currentAcademicYear: 2569, entryYear: 2566 })).toEqual({
      fieldErrors: ['form'],
      success: false,
    });
  });
});

function validForm(): FormData {
  const form = new FormData();
  form.set('academicYear', '2569');
  form.set('category', 'course_work');
  form.set('description', 'รายละเอียดผลงาน');
  form.set('idempotencyKey', IDEMPOTENCY_KEY);
  form.set('semester', '1');
  form.set('summary', 'สรุปผลงาน');
  form.set('title', 'ระบบแนะนำผลงาน');
  for (let index = 0; index < 5; index += 1) {
    form.set(`linkLabel${index}`, '');
    form.set(`linkUrl${index}`, '');
    form.set(`tag${index}`, '');
  }
  return form;
}
