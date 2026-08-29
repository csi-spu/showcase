import { describe, expect, it } from 'vitest';
import { validateRosterStudent } from './roster-student-validation';

describe('validateRosterStudent', () => {
  it('accepts and trims the three required fields without an Entry Year', () => {
    const formData = new FormData();
    formData.set('studentId', '69000001');
    formData.set('firstNameTh', ' สมชาย ');
    formData.set('lastNameTh', ' ใจดี ');
    formData.set('entryYear', '2500');

    expect(validateRosterStudent(formData)).toEqual({
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      studentId: '69000001',
    });
  });

  it.each([
    ['invalid Student ID', 'studentId', '6900000'],
    ['empty first name', 'firstNameTh', '   '],
    ['empty last name', 'lastNameTh', '   '],
  ])('rejects %s', (_case, field, value) => {
    const formData = new FormData();
    formData.set('studentId', '69000001');
    formData.set('firstNameTh', 'สมชาย');
    formData.set('lastNameTh', 'ใจดี');
    formData.set(field, value);

    expect(validateRosterStudent(formData)).toBeNull();
  });
});
