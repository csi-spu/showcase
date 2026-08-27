import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicFeedback, PublicPageIntro } from './public-page';

describe('Visitor shared public page presentation', () => {
  it('gives catalog routes a consistent branded introduction', () => {
    const html = renderToStaticMarkup(
      <PublicPageIntro
        description="ค้นพบผลงานจากนักศึกษา CSI"
        eyebrow="Student Showcase"
        title="ผลงานทั้งหมด"
      />,
    );

    expect(html).toContain('<header');
    expect(html).toContain('Student Showcase');
    expect(html).toContain('<h1');
    expect(html).toContain('ผลงานทั้งหมด');
    expect(html).toContain('ค้นพบผลงานจากนักศึกษา CSI');
    expect(html).toContain('data-public-page-intro="true"');
  });

  it('keeps recovery states direct and gives Visitors a safe next route', () => {
    const html = renderToStaticMarkup(
      <PublicFeedback
        actionHref="/works"
        actionLabel="กลับไปดูผลงาน"
        code="404"
        description="ไม่พบหน้าที่ต้องการ"
        title="หน้านี้ไม่มีอยู่"
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('404');
    expect(html).toContain('หน้านี้ไม่มีอยู่');
    expect(html).toContain('href="/works"');
    expect(html).toContain('กลับไปดูผลงาน');
    expect(html).toContain('data-public-feedback="true"');
  });
});
