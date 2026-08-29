import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PeopleCatalogCard, WorkCatalogCard } from '@/lib/public-catalog-core';
import { HomepageFeaturedCollections } from './homepage-featured-collections';

describe('Homepage featured collections', () => {
  it('renders four bounded discovery sections with links to each full collection', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[work('บทความแนะนำ', 'academic_article', 3)]}
        competitionEntries={[work('ผลงานแข่งขันแนะนำ', 'competition_entry', 2)]}
        courseWorks={[
          work('ผลงานในชั้นเรียนแนะนำ', 'course_work', 1),
          work('ผลงานในชั้นเรียนรองหนึ่ง', 'course_work', 4),
          work('ผลงานในชั้นเรียนรองสอง', 'course_work', 5),
        ]}
        labels={{
          academicArticles: {
            artworkAlt: 'ภาพประกอบบทความวิชาการ',
            description: 'บทความวิชาการล่าสุด',
            title: 'ผลงานบทความวิชาการ',
            viewAll: 'ดูบทความวิชาการทั้งหมด',
          },
          competitionEntries: {
            artworkAlt: 'ภาพประกอบผลงานแข่งขัน',
            description: 'ผลงานจากเวทีแข่งขันล่าสุด',
            title: 'ผลงานแข่งขัน',
            viewAll: 'ดูผลงานแข่งขันทั้งหมด',
          },
          courseWorks: {
            artworkAlt: 'ภาพประกอบผลงานในชั้นเรียน',
            description: 'ผลงานจากห้องเรียนล่าสุด',
            title: 'ผลงานในชั้นเรียน',
            viewAll: 'ดูผลงานในชั้นเรียนทั้งหมด',
          },
          emptyPeople: 'ยังไม่มีนักศึกษาแนะนำ',
          emptyWorks: 'ยังไม่มีผลงานแนะนำ',
          people: {
            artworkAlt: 'ภาพประกอบนักศึกษา',
            description: 'ทำความรู้จักนักศึกษา',
            title: 'นักศึกษา',
            viewAll: 'ดูนักศึกษาทั้งหมด',
          },
          personPhotoAlt: (name) => `รูปโปรไฟล์ของ ${name}`,
          posterAlt: (title) => `โปสเตอร์ ${title}`,
          publishedWorks: (count) => `ผลงานเผยแพร่ ${count} ชิ้น`,
          studentEntryYear: (year) => `ปีที่เข้าศึกษา ${year}`,
        }}
        people={[person()]}
      />,
    );

    expect(html).toContain('ผลงานในชั้นเรียน');
    expect(html).toContain('ผลงานแข่งขัน');
    expect(html).toContain('ผลงานบทความวิชาการ');
    expect(html).toContain('นักศึกษา');
    expect(html).toContain('href="/works?category=course_work"');
    expect(html).toContain('href="/works?category=competition_entry"');
    expect(html).toContain('href="/works?category=academic_article"');
    expect(html).toContain('href="/people"');
    expect(html.match(/<section/g)).toHaveLength(4);
    expect(html).not.toMatch(/>0[1-4]</);
    expect(html.match(/data-featured-layout="standard"/g)).toHaveLength(3);
    expect(html).toContain('data-homepage-collection-stage="true"');
    expect(html).toContain('data-section-layout="course-work"');
    expect(html).toContain('data-section-layout="competition-entry"');
    expect(html).toContain('data-section-layout="academic-article"');
    expect(html).toContain('data-section-layout="people"');
    expect(html.match(/data-work-card-layout="poster"/g)).toHaveLength(5);
    expect(html.match(/aspect-\[3\/4\]/g)).toHaveLength(5);
    expect(html.match(/data-section-artwork="true"/g)).toHaveLength(4);
    expect(html.match(/data-header-surface="open"/g)).toHaveLength(4);
    expect(html.match(/data-artwork-emphasis="balanced"/g)).toHaveLength(4);
    expect(html.match(/data-artwork-shape="landscape"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shape="portrait"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shape="square"/g)).toHaveLength(2);
    expect(html.match(/data-artwork-shadow="wide"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shadow="deep"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shadow="soft"/g)).toHaveLength(2);
    expect(html.match(/data-header-direction="normal"/g)).toHaveLength(2);
    expect(html.match(/data-header-direction="reverse"/g)).toHaveLength(2);
    expect(html.match(/data-poster-fallback="true"/g)).toHaveLength(5);
    expect(html.match(/data-person-card-layout="portrait"/g)).toHaveLength(1);
    expect(html.match(/data-person-photo-fallback="true"/g)).toHaveLength(1);
    expect(html.match(/data-person-card-meta="true"/g)).toHaveLength(1);
    expect(html.match(/aspect-\[4\/5\]/g)).toHaveLength(1);
    expect(html).toContain('data-fallback-variant="0"');
    expect(html).toContain('data-fallback-variant="1"');
    expect(html).toContain('data-fallback-variant="2"');
    expect(html).toContain('%2Fimages%2Fhome%2Fcourse-work.webp');
    expect(html).toContain('%2Fimages%2Fhome%2Fcompetition-entry.webp');
    expect(html).toContain('%2Fimages%2Fhome%2Facademic-article.webp');
    expect(html).toContain('%2Fimages%2Fhome%2Fpeople.webp');
  });

  it('renders composed placeholders when featured collections are empty', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={[]}
        labels={{
          academicArticles: sectionLabels('ผลงานบทความวิชาการ'),
          competitionEntries: sectionLabels('ผลงานแข่งขัน'),
          courseWorks: sectionLabels('ผลงานในชั้นเรียน'),
          emptyPeople: 'ยังไม่มีนักศึกษาแนะนำ',
          emptyWorks: 'ยังไม่มีผลงานแนะนำ',
          people: sectionLabels('นักศึกษา'),
          personPhotoAlt: (name) => `รูปโปรไฟล์ของ ${name}`,
          posterAlt: (title) => `โปสเตอร์ ${title}`,
          publishedWorks: (count) => `ผลงานเผยแพร่ ${count} ชิ้น`,
          studentEntryYear: (year) => `ปีที่เข้าศึกษา ${year}`,
        }}
        people={[]}
      />,
    );

    expect(html.match(/data-empty-state="true"/g)).toHaveLength(4);
    expect(html.match(/ยังไม่มีผลงานแนะนำ/g)).toHaveLength(3);
    expect(html).toContain('ยังไม่มีนักศึกษาแนะนำ');
  });
});

function sectionLabels(title: string) {
  return {
    artworkAlt: `ภาพประกอบ${title}`,
    description: `คำอธิบาย ${title}`,
    title,
    viewAll: `ดู${title}ทั้งหมด`,
  };
}

function work(
  title: string,
  category: WorkCatalogCard['category'],
  index: number,
): WorkCatalogCard {
  const suffix = String(index).padStart(12, '0');
  return {
    academicPeriod: { semester: '1', year: 2569 },
    attributions: ['นักศึกษาตัวอย่าง'],
    category,
    poster: null,
    publishedAt: '2026-08-26T08:00:00.000Z',
    summary: 'สรุปผลงานแนะนำ',
    tags: [],
    title,
    workPublicId: `9b000000-0000-4000-8000-${suffix}`,
  };
}

function person(): PeopleCatalogCard {
  return {
    bio: 'สนใจระบบเว็บ',
    entryYear: 2567,
    firstName: 'นักศึกษา',
    lastName: 'ตัวอย่าง',
    photo: null,
    publicId: '9c000000-0000-4000-8000-000000000001',
    publishedWorkCount: 3,
  };
}
