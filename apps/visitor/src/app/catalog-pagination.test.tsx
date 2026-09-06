import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogPagination } from './catalog-pagination';
import { catalogPageWindow } from './catalog-url';

const labels = {
  ellipsis: 'เพิ่มเติม',
  goToPage: (page: number) => `ไปหน้า ${page}`,
  nextPage: 'ถัดไป',
  previousPage: 'ก่อนหน้า',
};

describe('CatalogPagination', () => {
  it('renders nothing for a single-page result', () => {
    const window = catalogPageWindow('/people', {}, 1);
    const html = renderToStaticMarkup(
      <CatalogPagination ariaLabel="เปลี่ยนหน้า" labels={labels} window={window} />,
    );

    expect(html).toBe('');
  });

  it('shows every page directly, including a last-page anchor, when there are more pages than fit in the window', () => {
    const window = catalogPageWindow('/people', {}, 5);
    const html = renderToStaticMarkup(
      <CatalogPagination ariaLabel="เปลี่ยนหน้า" labels={labels} window={window} />,
    );

    expect(html).toContain('href="/people?page=2"');
    expect(html).toContain('href="/people?page=3"');
    expect(html).toContain('href="/people?page=5"');
    expect(html).not.toContain('href="/people?page=1"');
  });

  it('does not show a trailing ellipsis or last-page anchor when the window already reaches the last page', () => {
    const window = catalogPageWindow('/people', {}, 3);
    const html = renderToStaticMarkup(
      <CatalogPagination ariaLabel="เปลี่ยนหน้า" labels={labels} window={window} />,
    );

    expect(html).toContain('href="/people?page=3"');
    expect(html.match(/เพิ่มเติม/g) ?? []).toHaveLength(0);
  });

  it('shows both a leading and a trailing ellipsis when browsing the middle of a long list', () => {
    const window = catalogPageWindow('/people', { page: '5' }, 10);
    const html = renderToStaticMarkup(
      <CatalogPagination ariaLabel="เปลี่ยนหน้า" labels={labels} window={window} />,
    );

    expect(html).toContain('href="/people"');
    expect(html).toContain('href="/people?page=10"');
    expect(html.match(/เพิ่มเติม/g) ?? []).toHaveLength(2);
  });

  it('marks the current page as active', () => {
    const window = catalogPageWindow('/people', { page: '2' }, 5);
    const html = renderToStaticMarkup(
      <CatalogPagination ariaLabel="เปลี่ยนหน้า" labels={labels} window={window} />,
    );

    expect(html).toContain('aria-current="page"');
  });
});
