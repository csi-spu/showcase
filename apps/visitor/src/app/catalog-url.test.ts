import { describe, expect, it } from 'vitest';
import { catalogPageWindow, catalogPagination } from './catalog-url';

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

describe('Public Catalog page-number windows', () => {
  it('shows only the first page with a next link when browsing starts', () => {
    const window = catalogPageWindow('/works', { sort: 'title' }, 'cursor-page-2');

    expect(window).toEqual({
      currentPage: 1,
      firstPage: null,
      nextUrl: '/works?sort=title&cursor=cursor-page-2&page=2',
      pages: [{ href: '/works?sort=title', page: 1 }],
      previousUrl: null,
    });
  });

  it('rebuilds every visited page from the cursor trail without an artificial future page', () => {
    const window = catalogPageWindow(
      '/works',
      {
        cursor: 'cursor-page-4',
        page: '4',
        sort: 'title',
        trail: ['cursor-page-2', 'cursor-page-3'],
      },
      'cursor-page-5',
    );

    expect(window).toEqual({
      currentPage: 4,
      firstPage: null,
      nextUrl:
        '/works?sort=title&trail=cursor-page-2&trail=cursor-page-3&trail=cursor-page-4&cursor=cursor-page-5&page=5',
      pages: [
        { href: '/works?sort=title', page: 1 },
        { href: '/works?sort=title&cursor=cursor-page-2&page=2', page: 2 },
        { href: '/works?sort=title&trail=cursor-page-2&cursor=cursor-page-3&page=3', page: 3 },
        {
          href: '/works?cursor=cursor-page-4&page=4&sort=title&trail=cursor-page-2&trail=cursor-page-3',
          page: 4,
        },
      ],
      previousUrl: '/works?sort=title&trail=cursor-page-2&cursor=cursor-page-3&page=3',
    });
  });

  it('pins page one with a gap once the visited window moves past it', () => {
    const window = catalogPageWindow(
      '/works',
      {
        cursor: 'cursor-page-6',
        page: '6',
        trail: ['cursor-page-2', 'cursor-page-3', 'cursor-page-4', 'cursor-page-5'],
      },
      null,
    );

    expect(window.firstPage).toEqual({ href: '/works', page: 1 });
    expect(window.pages.map((page) => page.page)).toEqual([4, 5, 6]);
    expect(window.nextUrl).toBeNull();
  });
});
