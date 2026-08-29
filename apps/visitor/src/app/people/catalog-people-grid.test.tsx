import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogPeopleGrid } from './catalog-people-grid';

const labels = {
  empty: 'ยังไม่พบนักศึกษา',
  entryYear: (year: number) => `ปีที่เข้าศึกษา ${year}`,
  photoAlt: (name: string) => `รูปโปรไฟล์ของ ${name}`,
  publishedWorks: (count: number) => `ผลงานเผยแพร่ ${count} ชิ้น`,
};

describe('Public Catalog People grid', () => {
  it('renders a consistent portrait card without exposing private Person data', () => {
    const html = renderToStaticMarkup(
      <CatalogPeopleGrid
        labels={labels}
        people={[
          {
            bio: 'สนใจการออกแบบประสบการณ์ที่ใช้งานง่ายและเข้าถึงได้สำหรับทุกคน',
            entryYear: 2567,
            firstName: 'กานต์พิชชา',
            lastName: 'ใจดี',
            photo: null,
            publicId: '81000000-0000-4000-8000-000000000001',
            publishedWorkCount: 3,
          },
        ]}
      />,
    );

    expect(html).toContain('href="/people/81000000-0000-4000-8000-000000000001"');
    expect(html).toContain('data-person-photo-fallback="true"');
    expect(html).toContain('data-person-photo-fallback-kind="generic-avatar"');
    expect(html).toContain('data-person-card-layout="compact"');
    expect(html).toContain('สนใจการออกแบบประสบการณ์ที่ใช้งานง่ายและเข้าถึงได้สำหรับทุกคน');
    expect(html).toContain('line-clamp-3');
    expect(html).toContain('ปีที่เข้าศึกษา 2567');
    expect(html).toContain('ผลงานเผยแพร่ 3 ชิ้น');
    expect(html).not.toMatch(/studentId|account|session/i);
  });

  it('renders the shared composed empty state', () => {
    const html = renderToStaticMarkup(<CatalogPeopleGrid labels={labels} people={[]} />);

    expect(html).toContain('data-empty-state="true"');
    expect(html).toContain('ยังไม่พบนักศึกษา');
  });
});
