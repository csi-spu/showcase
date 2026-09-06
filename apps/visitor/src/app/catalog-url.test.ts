import { describe, expect, it } from 'vitest';
import { catalogPageHref, catalogPageWindow, clampPage } from './catalog-url';

describe('Public Catalog page hrefs', () => {
  it('omits the page param for page 1 while preserving filters', () => {
    expect(
      catalogPageHref('/works', { category: ['course_work', 'academic_article'], q: 'เว็บ' }, 1),
    ).toBe(
      '/works?category=course_work&category=academic_article&q=%E0%B9%80%E0%B8%A7%E0%B9%87%E0%B8%9A',
    );
  });

  it('includes the page param and preserves filters for later pages', () => {
    expect(catalogPageHref('/works', { sort: 'title' }, 3)).toBe('/works?sort=title&page=3');
  });

  it('drops any existing page param from filters before appending the target page', () => {
    expect(catalogPageHref('/works', { page: '5', sort: 'title' }, 2)).toBe(
      '/works?sort=title&page=2',
    );
  });
});

describe('clampPage', () => {
  it('clamps below 1 up to 1', () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
  });

  it('clamps above totalPages down to totalPages', () => {
    expect(clampPage(999, 10)).toBe(10);
  });

  it('treats a totalPages of 0 as a single page', () => {
    expect(clampPage(5, 0)).toBe(1);
  });

  it('passes through an in-range page unchanged', () => {
    expect(clampPage(4, 10)).toBe(4);
  });
});

describe('Public Catalog page-number windows', () => {
  it('shows only page 1 with no anchors when there is a single page', () => {
    const window = catalogPageWindow('/works', { sort: 'title' }, 1);

    expect(window).toEqual({
      currentPage: 1,
      firstPage: null,
      lastPage: null,
      nextUrl: null,
      pages: [{ href: '/works?sort=title', page: 1 }],
      previousUrl: null,
      totalPages: 1,
    });
  });

  it('shows a next link but no last-page anchor when browsing starts near the front', () => {
    const window = catalogPageWindow('/works', { sort: 'title' }, 3);

    expect(window).toEqual({
      currentPage: 1,
      firstPage: null,
      lastPage: null,
      nextUrl: '/works?sort=title&page=2',
      pages: [
        { href: '/works?sort=title', page: 1 },
        { href: '/works?sort=title&page=2', page: 2 },
        { href: '/works?sort=title&page=3', page: 3 },
      ],
      previousUrl: null,
      totalPages: 3,
    });
  });

  it('exposes every page directly, including pages never visited before, given only a total page count', () => {
    const window = catalogPageWindow('/works', { page: '4', sort: 'title' }, 10);

    expect(window.currentPage).toBe(4);
    expect(window.pages.map((page) => page.page)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(window.previousUrl).toBe('/works?sort=title&page=3');
    expect(window.nextUrl).toBe('/works?sort=title&page=5');
  });

  it('pins page one with a leading gap once the window moves past it', () => {
    const window = catalogPageWindow('/works', { page: '6' }, 10);

    expect(window.firstPage).toEqual({ href: '/works', page: 1 });
    expect(window.pages.map((page) => page.page)).toEqual([4, 5, 6, 7, 8]);
  });

  it('pins the last page with a trailing gap once the window ends before it', () => {
    const window = catalogPageWindow('/works', { page: '1' }, 10);

    expect(window.lastPage).toEqual({ href: '/works?page=10', page: 10 });
    expect(window.pages.map((page) => page.page)).toEqual([1, 2, 3]);
  });

  it('pins both first and last page anchors when browsing the middle of a long list', () => {
    const window = catalogPageWindow('/works', { page: '10' }, 20);

    expect(window.firstPage).toEqual({ href: '/works', page: 1 });
    expect(window.lastPage).toEqual({ href: '/works?page=20', page: 20 });
    expect(window.pages.map((page) => page.page)).toEqual([8, 9, 10, 11, 12]);
  });

  it('shows no next link and a last-page anchor equal to the current page never appears once on the last page', () => {
    const window = catalogPageWindow('/works', { page: '10' }, 10);

    expect(window.lastPage).toBeNull();
    expect(window.nextUrl).toBeNull();
    expect(window.previousUrl).toBe('/works?page=9');
  });

  it('clamps an out-of-range requested page into the valid window', () => {
    const window = catalogPageWindow('/works', { page: '999' }, 5);

    expect(window.currentPage).toBe(5);
    expect(window.lastPage).toBeNull();
  });
});
