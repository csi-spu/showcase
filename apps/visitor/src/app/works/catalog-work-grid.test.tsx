import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogWorkGrid } from './catalog-work-grid';

describe('Public Catalog Work grid', () => {
  it('renders Poster-only server markup with one LCP preload and lazy remaining images', () => {
    const html = renderToStaticMarkup(
      <CatalogWorkGrid
        isHomepage
        labels={{ empty: 'ไม่พบผลงาน', posterAlt: (title) => `โปสเตอร์ ${title}` }}
        works={[work(1), work(2)]}
      />,
    );

    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html.match(/rel="preload"/g)).toHaveLength(1);
    expect(html.match(/loading="lazy"/g)).toHaveLength(1);
    expect(html).toContain('sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"');
    expect(html).not.toMatch(/gallery/i);
  });

  it('keeps a Work discoverable when its poster projection is unavailable', () => {
    const item = { ...work(3), poster: null };
    const html = renderToStaticMarkup(
      <CatalogWorkGrid
        labels={{
          empty: 'ไม่พบผลงาน',
          openWork: 'เปิดดูผลงาน',
          posterAlt: (title) => `โปสเตอร์ ${title}`,
        }}
        works={[item]}
      />,
    );

    expect(html).toContain('data-poster-fallback="true"');
    expect(html).toContain(`href="/works/${item.workPublicId}"`);
    expect(html).toContain('ผลงาน 3');
    expect(html).toContain('เปิดดูผลงาน');
  });
});

function work(index: number) {
  const suffix = String(index).padStart(12, '0');
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    attributions: ['ผู้สร้าง'],
    category: 'course_work' as const,
    poster: {
      assetId: `9a000000-0000-4000-8000-${suffix}`,
      dominantColor: '#285078',
      height: 1800,
      variants: [
        { height: 720, width: 480 },
        { height: 1080, width: 720 },
      ],
      width: 1200,
    },
    publishedAt: '2026-08-26T08:00:00.000Z',
    summary: `สรุป ${index}`,
    tags: [],
    title: `ผลงาน ${index}`,
    workPublicId: `9b000000-0000-4000-8000-${suffix}`,
  };
}
