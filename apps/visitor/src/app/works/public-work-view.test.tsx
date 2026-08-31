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
          carouselGoToSlide: (index) => `ไปภาพที่ ${index}`,
          carouselNext: 'ภาพถัดไป',
          carouselPrevious: 'ภาพก่อนหน้า',
          category: 'ผลงานรายวิชา',
          description: 'รายละเอียด',
          gallery: 'แกลเลอรีภาพ',
          galleryAlt: (index) => `ภาพเพิ่มเติม ${index} ของ ระบบแนะนำผลงาน`,
          links: 'ลิงก์',
          missingAttributions: 'ยังไม่มีรายละเอียดผู้สร้างผลงาน',
          missingPoster: 'ยังไม่มีภาพโปสเตอร์',
          posterAlt: 'โปสเตอร์ ระบบแนะนำผลงาน',
          publishedAt: '26 ส.ค. 2569',
          publishedAtLabel: 'เผยแพร่เมื่อ',
          removal: removalLabels,
          studyYear: (year) => `ชั้นปีที่ ${year}`,
          tagsLabel: 'หัวข้อของผลงาน',
          videoAlt: (index) => `วิดีโอ ${index}`,
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
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain(
      'src="/works/87000000-0000-4000-8000-000000000001/media/87000000-0000-4000-8000-000000000006/1600"',
    );
  });

  it('renders themed fallbacks when poster and attribution data are absent', () => {
    const work = publicWork();
    const html = renderToStaticMarkup(
      <PublicWorkView
        labels={{
          academicPeriod: 'ปีการศึกษา 2569 ภาค 1',
          attributions: 'ผู้สร้างผลงาน',
          carouselGoToSlide: (index) => `ไปภาพที่ ${index}`,
          carouselNext: 'ภาพถัดไป',
          carouselPrevious: 'ภาพก่อนหน้า',
          category: 'ผลงานรายวิชา',
          description: 'รายละเอียด',
          gallery: 'แกลเลอรีภาพ',
          galleryAlt: (index) => `ภาพเพิ่มเติม ${index}`,
          links: 'ลิงก์',
          missingAttributions: 'ยังไม่มีรายละเอียดผู้สร้างผลงาน',
          missingPoster: 'ยังไม่มีภาพโปสเตอร์',
          posterAlt: 'โปสเตอร์ ระบบแนะนำผลงาน',
          publishedAt: '26 ส.ค. 2569',
          publishedAtLabel: 'เผยแพร่เมื่อ',
          removal: removalLabels,
          studyYear: (year) => `ชั้นปีที่ ${year}`,
          tagsLabel: 'หัวข้อของผลงาน',
          videoAlt: (index) => `วิดีโอ ${index}`,
          videos: 'วิดีโอ',
        }}
        work={{ ...work, attributions: [], media: [] }}
      />,
    );

    expect(html).toContain('ยังไม่มีภาพโปสเตอร์');
    expect(html).toContain('ยังไม่มีรายละเอียดผู้สร้างผลงาน');
    expect(html).toContain('data-poster-fallback="true"');
  });
});

function publicWork() {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    attributions: [
      {
        affiliation: null,
        attributionPublicId: '87000000-0000-4000-8000-000000000005',
        attributionName: 'ชื่อผู้ส่ง snapshot',
        canRequestRemoval: false,
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
      {
        assetId: '87000000-0000-4000-8000-000000000006',
        dominantColor: '#3A5A78',
        height: 1000,
        kind: 'gallery' as const,
        position: 1,
        variants: [{ height: 1000, width: 1600 }],
        width: 1600,
      },
    ],
    publishedAt: '2026-08-25T18:00:00.000Z',
    revisionNumber: 1,
    summary: 'สรุปผลงาน',
    tags: [{ displayLabel: 'React', publicId: '87000000-0000-4000-8000-000000000003' }],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [
      {
        provider: 'youtube' as const,
        providerVideoId: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    ],
    workPublicId: '87000000-0000-4000-8000-000000000001',
  };
}

const removalLabels = {
  heading: 'ขอนำชื่อออก',
  help: 'รายละเอียด',
  invalid: 'ไม่ถูกต้อง',
  rateLimited: 'รอสักครู่',
  reason: 'เหตุผล',
  received: 'รับแล้ว',
  submit: 'ส่ง',
  unavailable: 'ไม่พร้อม',
};
