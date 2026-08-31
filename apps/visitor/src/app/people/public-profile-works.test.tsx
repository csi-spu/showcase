import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicProfileWorks } from './public-profile-works';

const LABELS = {
  description: 'ผลงานเผยแพร่ล่าสุดที่นักศึกษาคนนี้ร่วมสร้าง',
  empty: 'ยังไม่มีผลงานเผยแพร่ที่เชื่อมโยงกับโปรไฟล์นี้',
  heading: 'ผลงานที่มีส่วนร่วม',
  posterAlt: (title: string) => `โปสเตอร์ ${title}`,
};

describe('Visitor Public Profile Works UI', () => {
  it('links attributed Published Works from the Public Profile', () => {
    const html = renderToStaticMarkup(
      <PublicProfileWorks
        labels={LABELS}
        works={[
          {
            academicPeriod: { semester: '1', year: 2569 },
            attributions: ['ณัฐดนัย', 'อริสา'],
            category: 'course_work',
            poster: null,
            publishedAt: '2026-08-26T08:00:00.000Z',
            summary: 'สรุปผลงาน',
            tags: [],
            title: 'ระบบแนะนำผลงาน',
            workPublicId: '87000000-0000-4000-8000-000000000001',
          },
        ]}
      />,
    );

    expect(html).toContain('ผลงานที่มีส่วนร่วม');
    expect(html).toContain('ระบบแนะนำผลงาน');
    expect(html).toContain('href="/works/87000000-0000-4000-8000-000000000001"');
  });

  it('renders an empty state when the Public Profile has no attributed Published Works', () => {
    const html = renderToStaticMarkup(<PublicProfileWorks labels={LABELS} works={[]} />);

    expect(html).toContain('ยังไม่มีผลงานเผยแพร่ที่เชื่อมโยงกับโปรไฟล์นี้');
    expect(html).toContain('data-empty-state="true"');
  });
});
