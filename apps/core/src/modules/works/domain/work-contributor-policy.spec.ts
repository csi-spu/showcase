import {
  normalizeContributionRole,
  normalizeContributorSearchQuery,
  normalizeExternalContributor,
  validateExactStudentId,
} from './work-contributor-policy';

describe('Work Contributor policy', () => {
  it('accepts only an exact eight-digit Student ID', () => {
    expect(validateExactStudentId('69000001')).toBe(true);
    expect(validateExactStudentId('6900000')).toBe(false);
    expect(validateExactStudentId('690000011')).toBe(false);
    expect(validateExactStudentId('6900 001')).toBe(false);
    expect(validateExactStudentId('6900000ก')).toBe(false);
  });

  it('normalizes a required contribution role', () => {
    expect(normalizeContributionRole('  ออกแบบระบบ  ')).toBe('ออกแบบระบบ');
    expect(normalizeContributionRole('   ')).toBeNull();
    expect(normalizeContributionRole('ก'.repeat(101))).toBeNull();
  });

  it('normalizes a name or one-to-eight-digit Student ID prefix search', () => {
    expect(normalizeContributorSearchQuery('  สมชาย   ใจดี  ')).toEqual({
      kind: 'name',
      nameQuery: 'สมชาย ใจดี',
    });
    expect(normalizeContributorSearchQuery('6')).toEqual({
      kind: 'student_id_prefix',
      studentIdPrefix: '6',
    });
    expect(normalizeContributorSearchQuery('6900000')).toEqual({
      kind: 'student_id_prefix',
      studentIdPrefix: '6900000',
    });
    expect(normalizeContributorSearchQuery('69000001')).toEqual({
      kind: 'student_id_prefix',
      studentIdPrefix: '69000001',
    });
    expect(normalizeContributorSearchQuery('690000011')).toBeNull();
    expect(normalizeContributorSearchQuery('ก'.repeat(101))).toBeNull();
  });

  it('locks one external Attribution Name without linking by name', () => {
    expect(
      normalizeExternalContributor({
        attributionName: ' สมชาย   ใจดี ',
        contributionRole: ' เขียนโปรแกรม ',
      }),
    ).toEqual({ attributionName: 'สมชาย ใจดี', contributionRole: 'เขียนโปรแกรม' });
    expect(
      normalizeExternalContributor({ attributionName: ' ', contributionRole: 'บทบาท' }),
    ).toBeNull();
  });
});
