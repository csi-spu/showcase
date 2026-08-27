import { describe, expect, it } from 'vitest';
import { catalogPagination } from './catalog-url';

describe('Public Catalog pagination URLs', () => {
  it('preserves filters when continuing from the first page', () => {
    const pagination = catalogPagination(
      '/works',
      { category: ['course_work', 'academic_article'], q: 'เว็บ' },
      'cursor-page-2',
    );

    expect(pagination).toEqual({
      currentPage: 1,
      nextUrl:
        '/works?category=course_work&category=academic_article&q=%E0%B9%80%E0%B8%A7%E0%B9%87%E0%B8%9A&cursor=cursor-page-2&page=2',
      previousUrl: null,
    });
  });

  it('builds deterministic previous and next URLs on a later page', () => {
    const pagination = catalogPagination(
      '/works',
      {
        cursor: 'cursor-page-3',
        page: '3',
        sort: 'title',
        trail: 'cursor-page-2',
      },
      'cursor-page-4',
    );

    expect(pagination).toEqual({
      currentPage: 3,
      nextUrl:
        '/works?sort=title&trail=cursor-page-2&trail=cursor-page-3&cursor=cursor-page-4&page=4',
      previousUrl: '/works?sort=title&cursor=cursor-page-2&page=2',
    });
  });

  it('returns from page two to the filtered first page without cursor metadata', () => {
    const pagination = catalogPagination(
      '/works',
      { cursor: 'cursor-page-2', page: '2', semester: 'summer' },
      null,
    );

    expect(pagination).toEqual({
      currentPage: 2,
      nextUrl: null,
      previousUrl: '/works?semester=summer',
    });
  });
});
