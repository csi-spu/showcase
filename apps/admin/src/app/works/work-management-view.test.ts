import { describe, expect, it } from 'vitest';
import {
  resolveWorkManagementPage,
  resolveWorkManagementView,
  workManagementHref,
} from './work-management-view';

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

  it.each([
    [undefined, 1],
    ['2', 2],
    ['0', 1],
    ['-1', 1],
    ['1.5', 1],
    ['not-a-page', 1],
    ['9007199254740992', 1],
  ])('resolves published page %s as %i', (value, expected) => {
    expect(resolveWorkManagementPage(value)).toBe(expected);
  });

  it('builds a cursor URL for an attribution queue', () => {
    expect(
      workManagementHref('attributions', {
        cursor: 'next/cursor',
      }),
    ).toBe('/works?view=attributions&cursor=next%2Fcursor');
    expect(workManagementHref('removals')).toBe('/works?view=removals');
  });

  it('builds a Published Works page URL with its search query', () => {
    expect(workManagementHref('published', { page: 2, q: 'ระบบ แนะนำ' })).toBe(
      '/works?view=published&page=2&q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A+%E0%B9%81%E0%B8%99%E0%B8%B0%E0%B8%99%E0%B8%B3',
    );
  });
});
