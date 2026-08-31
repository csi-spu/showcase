import { describe, expect, it } from 'vitest';
import { parseAdminWorkReference } from './admin-work-reference';

const WORK_ID = '79000000-0000-4000-8000-000000000001';

describe('parseAdminWorkReference', () => {
  it('accepts a Work public identifier or canonical Work URL', () => {
    expect(parseAdminWorkReference(WORK_ID)).toBe(WORK_ID);
    expect(parseAdminWorkReference(` https://showcase.example.test/works/${WORK_ID} `)).toBe(
      WORK_ID,
    );
  });

  it('rejects unrelated URLs and extra path segments', () => {
    expect(parseAdminWorkReference(`https://showcase.example.test/people/${WORK_ID}`)).toBeNull();
    expect(
      parseAdminWorkReference(`https://showcase.example.test/works/${WORK_ID}/edit`),
    ).toBeNull();
    expect(parseAdminWorkReference('not-a-work-reference')).toBeNull();
  });
});
