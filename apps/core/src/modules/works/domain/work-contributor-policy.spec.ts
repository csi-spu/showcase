import {
  normalizeContributionRole,
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

  it('locks an external Attribution Name without linking by name', () => {
    expect(
      normalizeExternalContributor({
        contributionRole: ' เขียนโปรแกรม ',
        firstName: ' สมชาย ',
        lastName: ' ใจดี ',
      }),
    ).toEqual({ attributionName: 'สมชาย ใจดี', contributionRole: 'เขียนโปรแกรม' });
    expect(
      normalizeExternalContributor({ contributionRole: 'บทบาท', firstName: '', lastName: 'ใจดี' }),
    ).toBeNull();
  });
});
