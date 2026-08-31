import { describe, expect, it } from 'vitest';
import { resolveWorkManagementView, workManagementHref } from './work-management-view';

describe('Work Management views', () => {
  it.each([
    ['reviews', 'reviews'],
    ['removals', 'removals'],
    ['attributions', 'attributions'],
    ['published', 'published'],
    [undefined, 'reviews'],
    ['unknown', 'reviews'],
  ] as const)('resolves %s to %s', (value, expected) => {
    expect(resolveWorkManagementView(value)).toBe(expected);
  });

  it('builds a bounded view URL and preserves only supplied query values', () => {
    expect(
      workManagementHref('published', {
        cursor: 'next/cursor',
        q: 'ระบบ แนะนำ',
      }),
    ).toBe(
      '/works?view=published&cursor=next%2Fcursor&q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A+%E0%B9%81%E0%B8%99%E0%B8%B0%E0%B8%99%E0%B8%B3',
    );
    expect(workManagementHref('removals')).toBe('/works?view=removals');
  });
});
