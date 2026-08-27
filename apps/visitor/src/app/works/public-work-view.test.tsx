import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicWorkView } from './public-work-view';

describe('Admin-to-Visitor Published Work UI', () => {
  it('renders approved snapshot attribution, conditional profile links, Tags, and processed media', () => {
    const html = renderToStaticMarkup(
      <PublicWorkView
        labels={{
          academicPeriod: 'ปีการศึกษา 2569 ภาค 1',
          attributions: 'ผู้สร้างผลงาน',
          category: 'ผลงานรายวิชา',
          description: 'รายละเอียด',
          gallery: 'แกลเลอรี',
          galleryAlt: (index) => `ภาพเพิ่มเติม ${index} ของ ระบบแนะนำผลงาน`,
          links: 'ลิงก์',
          posterAlt: 'โปสเตอร์ ระบบแนะนำผลงาน',
          publishedAt: 'เผยแพร่เมื่อ 26 ส.ค. 2569',
          studyYear: (year) => `ชั้นปีที่ ${year}`,
          tagsLabel: 'หัวข้อของผลงาน',
          videos: 'วิดีโอ',
        }}
        work={publicWork()}
      />,
    );

    expect(html).toContain('ระบบแนะนำผลงาน');
    expect(html).toContain('ชื่อผู้ส่ง snapshot');
    expect(html).toContain('href="/people/87000000-0000-4000-8000-000000000004"');
    expect(html).toContain('React');
    expect(html).toContain(
      'src="/works/87000000-0000-4000-8000-000000000001/media/87000000-0000-4000-8000-000000000002/480"',
    );
    expect(html).toContain(
      'srcSet="/works/87000000-0000-4000-8000-000000000001/media/87000000-0000-4000-8000-000000000002/480 480w"',
    );
    expect(html).not.toMatch(/studentId|accountId|personId|session/i);
  });
});

function publicWork() {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    attributions: [
      {
        affiliation: null,
        attributionName: 'ชื่อผู้ส่ง snapshot',
        contributionRole: null,
        profilePublicId: '87000000-0000-4000-8000-000000000004',
        studyYear: 2,
      },
    ],
    category: 'course_work' as const,
    description: 'รายละเอียดผลงาน',
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/work' }],
    media: [
      {
        assetId: '87000000-0000-4000-8000-000000000002',
        dominantColor: '#285078',
        height: 1800,
        kind: 'poster' as const,
        position: 1,
        variants: [{ height: 720, width: 480 }],
        width: 1200,
      },
    ],
    publishedAt: '2026-08-25T18:00:00.000Z',
    revisionNumber: 1,
    summary: 'สรุปผลงาน',
    tags: [{ displayLabel: 'React', publicId: '87000000-0000-4000-8000-000000000003' }],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
    workPublicId: '87000000-0000-4000-8000-000000000001',
  };
}
