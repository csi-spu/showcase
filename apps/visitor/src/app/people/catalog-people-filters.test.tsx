import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogPeopleFilters } from './catalog-people-filters';

describe('Public Catalog People filters', () => {
  it('renders available Entry Years as a dropdown and keeps the selected year', () => {
    const html = renderToStaticMarkup(
      <CatalogPeopleFilters
        entryYears={[2569, 2568]}
        labels={{
          all: 'ทั้งหมด',
          entryYear: 'ปีที่เข้าศึกษา',
          reset: 'ล้างตัวกรอง',
          search: 'ค้นหา',
          searchLabel: 'ค้นหานักศึกษา',
          searchPlaceholder: 'ชื่อที่ต้องการค้นหา',
        }}
        params={{ entryYear: '2568' }}
      />,
    );

    expect(html).toContain('name="entryYear"');
    expect(html).toMatch(/<option[^>]+value="2569">2569<\/option>/);
    expect(html).toMatch(/<option[^>]+value="2568" selected="">2568<\/option>/);
    expect(html).toContain('list="people-search-suggestions"');
  });
});
