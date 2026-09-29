import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PeopleCatalogCard, WorkCatalogCard } from '@/lib/public-catalog-core';
import { HomepageFeaturedCollections } from './homepage-featured-collections';

const STATS = { competitionEntries: 34, people: 1250, works: 215 };

describe('Homepage featured collections', () => {
  it('renders four bounded discovery sections with links to each full collection', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[
          work('บทความแนะนำ', 'academic_article', 3),
          work('บทความรองหนึ่ง', 'academic_article', 6),
          work('บทความรองสอง', 'academic_article', 7),
        ]}
        competitionEntries={[
          work('ผลงานแข่งขันแนะนำ', 'competition_entry', 2),
          work('ผลงานแข่งขันรองหนึ่ง', 'competition_entry', 8),
          work('ผลงานแข่งขันรองสอง', 'competition_entry', 9),
        ]}
        courseWorks={[
          work('ผลงานในชั้นเรียนแนะนำ', 'course_work', 1),
          work('ผลงานในชั้นเรียนรองหนึ่ง', 'course_work', 4),
          work('ผลงานในชั้นเรียนรองสอง', 'course_work', 5),
        ]}
        labels={collectionLabels()}
        stats={STATS}
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
    expect(html.match(/data-featured-layout="short"/g)).toHaveLength(4);
    expect(html).toContain('data-homepage-collection-stage="true"');
    // Per-category sections identify themselves by heading, so no category badge.
    expect(html).not.toContain('ผลงานรายวิชา');
    expect(html).toContain('data-section-layout="course-work"');
    expect(html).toContain('data-section-layout="competition-entry"');
    expect(html).toContain('data-section-layout="academic-article"');
    expect(html).toContain('data-section-layout="people"');
    expect(html.match(/data-work-card-layout="poster"/g)).toHaveLength(9);
    expect(html.match(/aspect-\[7\/8\]/g)).toHaveLength(9);
    expect(html.match(/data-section-artwork="true"/g)).toHaveLength(4);
    expect(html.match(/data-header-surface="open"/g)).toHaveLength(4);
    expect(html.match(/data-artwork-emphasis="balanced"/g)).toHaveLength(4);
    expect(html.match(/data-artwork-shape="landscape"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shape="portrait"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shape="square"/g)).toHaveLength(2);
    expect(html.match(/data-artwork-shadow="wide"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shadow="deep"/g)).toHaveLength(1);
    expect(html.match(/data-artwork-shadow="soft"/g)).toHaveLength(2);
    expect(html.match(/data-poster-fallback="true"/g)).toHaveLength(9);
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
        labels={collectionLabels()}
        stats={STATS}
        people={[]}
      />,
    );

    // An empty catalogue merges to a single work placeholder, not one per category.
    expect(html.match(/data-empty-state="true"/g)).toHaveLength(2);
    expect(html.match(/ยังไม่มีผลงานแนะนำ/g)).toHaveLength(1);
    expect(html).toContain('ยังไม่มีนักศึกษาแนะนำ');
    // The header's link to the full catalogue stays live even with no cards to show.
    expect(html).toContain('href="/works"');
    expect(html).toContain('href="/people"');
  });

  it('merges every category into one recent-first section when a category is short', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[publishedWork('บทความล่าสุด', 'academic_article', 1, '2026-09-01')]}
        competitionEntries={[
          publishedWork('ผลงานแข่งขันกลาง', 'competition_entry', 2, '2026-08-15'),
          publishedWork('ผลงานแข่งขันเก่า', 'competition_entry', 3, '2026-07-01'),
          publishedWork('ผลงานแข่งขันเก่าสุด', 'competition_entry', 4, '2026-06-01'),
        ]}
        courseWorks={[
          publishedWork('ผลงานในชั้นเรียนกลาง', 'course_work', 5, '2026-08-20'),
          publishedWork('ผลงานในชั้นเรียนเก่า', 'course_work', 6, '2026-07-15'),
          publishedWork('ผลงานในชั้นเรียนเก่าสุด', 'course_work', 7, '2026-05-01'),
        ]}
        labels={collectionLabels()}
        stats={STATS}
        people={[person()]}
      />,
    );

    // One merged work section plus the people section, instead of three thin ones.
    expect(html.match(/<section/g)).toHaveLength(2);
    expect(html).toContain('id="featured-combined-works"');
    expect(html).toContain('data-section-layout="combined"');
    expect(html).toContain('ผลงานแนะนำ');
    expect(html).toContain('href="/works"');
    expect(html).not.toContain('href="/works?category=course_work"');
    // Merged cards carry a category badge because the heading no longer says it.
    // The rail repeats its slides to loop, so count one pass' worth of badges.
    const badgePasses = html.match(/ผลงานรายวิชา/g)?.length ?? 0;
    expect(badgePasses % 3).toBe(0);
    expect(badgePasses).toBeGreaterThanOrEqual(3);
    expect((html.match(/ผลงานประกวด/g)?.length ?? 0) % 3).toBe(0);
    expect(html).toContain('บทความวิชาการ');
    expect(html.indexOf('บทความล่าสุด') < html.indexOf('ผลงานในชั้นเรียนกลาง')).toBe(true);
    expect(html.indexOf('ผลงานในชั้นเรียนกลาง') < html.indexOf('ผลงานแข่งขันกลาง')).toBe(true);
  });

  it('keeps card width fixed when the merged collection is too short to fill a row', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[work('ผลงานแข่งขันเดี่ยว', 'competition_entry', 1)]}
        courseWorks={[
          work('ผลงานในชั้นเรียนหนึ่ง', 'course_work', 2),
          work('ผลงานในชั้นเรียนสอง', 'course_work', 3),
        ]}
        labels={collectionLabels()}
        stats={STATS}
        people={[person()]}
      />,
    );

    // A collection too short to fill the rail renders as a centred row capped to
    // its own content width, so no dead track is left beside the cards.
    expect(html).not.toContain('data-slot="carousel-item"');
    // One merged work row plus the people row.
    expect(html.match(/data-featured-layout="short"/g)).toHaveLength(2);
    expect(html.match(/w-\[18rem\]/g)).toHaveLength(3);
    expect(html.match(/mx-auto flex w-fit/g)).toHaveLength(2);
  });

  it('scrolls as a carousel once the merged collection can fill the rail', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={Array.from({ length: 6 }, (_, index) =>
          work(`ผลงานในชั้นเรียนที่ ${index}`, 'course_work', index + 10),
        )}
        labels={collectionLabels()}
        stats={STATS}
        people={[]}
      />,
    );

    expect(html.match(/data-featured-layout="carousel"/g)).toHaveLength(1);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('เลื่อนไปผลงานถัดไป');
    // The rail repeats a short collection so Embla has enough slides to wrap.
    // Repeats are hidden from assistive technology so each work is announced
    // once, but they stay interactive: `inert` would make every card past the
    // first pass unclickable once the rail scrolled.
    const slides = html.match(/data-slot="carousel-item"/g)?.length ?? 0;
    expect(slides).toBeGreaterThan(6);
    expect(slides % 6).toBe(0);
    expect(html).not.toContain('inert=""');
    const hiddenSlides =
      html.match(/data-slot="carousel-item"[^>]*aria-hidden="true"/g)?.length ?? 0;
    expect(hiddenSlides).toBe(slides - 6);
  });

  it('places work card badges at the head of the poster, above the title block', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={[work('ผลงานเดี่ยว', 'course_work', 30)]}
        labels={collectionLabels()}
        stats={STATS}
        people={[]}
      />,
    );

    // The poster fallback also paints the title, so anchor on the heading block
    // rather than on the first occurrence of the title text.
    const badgeIndex = html.indexOf('2569 / 1');
    const headingIndex = html.indexOf('<h3');
    expect(badgeIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeGreaterThan(-1);
    expect(badgeIndex).toBeLessThan(headingIndex);
    expect(html).toContain('absolute inset-x-3 top-3');
  });
});

describe('Homepage featured collection header', () => {
  it('shows catalogue totals once, in the first work section, in both layouts', () => {
    const merged = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={[work('ผลงานเดี่ยว', 'course_work', 40)]}
        labels={collectionLabels()}
        people={[]}
        stats={STATS}
      />,
    );
    const split = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[1, 2, 3].map((i) => work(`บทความ ${i}`, 'academic_article', i))}
        competitionEntries={[4, 5, 6].map((i) => work(`แข่งขัน ${i}`, 'competition_entry', i))}
        courseWorks={[7, 8, 9].map((i) => work(`รายวิชา ${i}`, 'course_work', i))}
        labels={collectionLabels()}
        people={[]}
        stats={STATS}
      />,
    );

    for (const html of [merged, split]) {
      expect(html.match(/data-catalog-stats="true"/g)).toHaveLength(1);
      expect(html).toContain('aria-label="ภาพรวมผลงานที่เผยแพร่"');
      expect(html).toContain('>215<');
      expect(html).toContain('>1,250<');
      expect(html).toContain('>34<');
      expect(html).toContain('นักศึกษาที่ร่วมแชร์');
    }
    expect(merged.indexOf('data-catalog-stats') < merged.indexOf('featured-people')).toBe(true);
    expect(
      split.indexOf('data-catalog-stats') < split.indexOf('featured-competition-entries'),
    ).toBe(true);
  });

  it('sets a two-line section title with a solid lead and a gradient accent line', () => {
    const labels = collectionLabels();
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={[]}
        labels={{
          ...labels,
          combined: {
            ...labels.combined,
            title: 'ผลงานและนวัตกรรม',
            titleSecondLine: 'จากนักศึกษาของเรา',
          },
        }}
        people={[]}
        stats={STATS}
      />,
    );

    const heading = html.match(/<h2[^>]*id="featured-combined-works"[^>]*>(.*?)<\/h2>/)?.[1];
    expect(heading).toMatch(
      /^<span class="block">ผลงานและนวัตกรรม<\/span><span class="[^"]*bg-clip-text[^"]*">จากนักศึกษาของเรา<\/span>$/,
    );
    // The people heading has no second line and stays a single solid run of text.
    expect(html).toMatch(/<h2[^>]*id="featured-people"[^>]*>นักศึกษา<\/h2>/);
    expect(html.match(/bg-clip-text/g)).toHaveLength(1);
  });

  it('heads each person card with the entry year, clear of the name block', () => {
    const labels = collectionLabels();
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={[]}
        labels={{
          ...labels,
          people: { ...labels.people, titleSecondLine: 'เบื้องหลังผลงาน' },
        }}
        people={[person()]}
        stats={STATS}
      />,
    );

    expect(html).toMatch(
      /<h2[^>]*id="featured-people"[^>]*><span class="block">นักศึกษา<\/span><span[^>]*>เบื้องหลังผลงาน<\/span><\/h2>/,
    );
    const card = html.slice(html.indexOf('data-person-card-layout'));
    const badgeIndex = card.indexOf('ปีที่เข้าศึกษา 2567');
    const metaIndex = card.indexOf('data-person-card-meta');
    expect(badgeIndex).toBeGreaterThan(-1);
    expect(badgeIndex).toBeLessThan(metaIndex);
    expect(card.slice(metaIndex)).not.toContain('ปีที่เข้าศึกษา');
  });

  it('ends the people rail on whole cards under a copy-first header', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={[]}
        labels={collectionLabels()}
        people={Array.from({ length: 6 }, (_, index) => ({
          ...person(),
          publicId: `9c000000-0000-4000-8000-00000000001${index}`,
        }))}
        stats={STATS}
      />,
    );

    const peopleSection = html.slice(html.indexOf('data-section-layout="people"'));
    expect(peopleSection).toContain('data-featured-layout="carousel"');
    expect(peopleSection).toContain('lg:basis-1/5');
    expect(peopleSection).not.toContain('lg:basis-[18%]');
    // Every header reads copy then artwork, matching the first section.
    expect(peopleSection.indexOf('id="featured-people"')).toBeLessThan(
      peopleSection.indexOf('data-section-artwork'),
    );
    expect(html).not.toContain('md:order-');
  });

  it('leads each header with a filled call to action to the full collection', () => {
    const html = renderToStaticMarkup(
      <HomepageFeaturedCollections
        academicArticles={[]}
        competitionEntries={[]}
        courseWorks={[]}
        labels={collectionLabels()}
        people={[]}
        stats={STATS}
      />,
    );

    expect(html.match(/data-collection-cta="true"/g)).toHaveLength(2);
    expect(html).toMatch(/<a(?=[^>]*data-collection-cta="true")(?=[^>]*href="\/works")/);
  });
});

function collectionLabels() {
  return {
    academicArticles: sectionLabels('ผลงานบทความวิชาการ'),
    categoryBadge: {
      academic_article: 'บทความวิชาการ',
      competition_entry: 'ผลงานประกวด',
      course_work: 'ผลงานรายวิชา',
    },
    combined: sectionLabels('ผลงานแนะนำ'),
    competitionEntries: sectionLabels('ผลงานแข่งขัน'),
    courseWorks: sectionLabels('ผลงานในชั้นเรียน'),
    emptyPeople: 'ยังไม่มีนักศึกษาแนะนำ',
    emptyWorks: 'ยังไม่มีผลงานแนะนำ',
    people: sectionLabels('นักศึกษา'),
    personPhotoAlt: (name: string) => `รูปโปรไฟล์ของ ${name}`,
    posterAlt: (title: string) => `โปสเตอร์ ${title}`,
    formatCount: (count: number) => count.toLocaleString('en-US'),
    publishedWorks: (count: number) => `ผลงานเผยแพร่ ${count} ชิ้น`,
    stats: {
      competitionEntries: 'รางวัลและประกวด',
      label: 'ภาพรวมผลงานที่เผยแพร่',
      people: 'นักศึกษาที่ร่วมแชร์',
      works: 'ผลงานทั้งหมด',
    },
    studentEntryYear: (year: number) => `ปีที่เข้าศึกษา ${year}`,
  };
}

function sectionLabels(title: string) {
  return {
    artworkAlt: `ภาพประกอบ${title}`,
    carouselNext: 'เลื่อนไปผลงานถัดไป',
    carouselPrevious: 'เลื่อนกลับไปผลงานก่อนหน้า',
    carouselRegion: 'แถบเลื่อนผลงาน',
    description: `คำอธิบาย ${title}`,
    eyebrow: `หมวด ${title}`,
    title,
    viewAll: `ดู${title}ทั้งหมด`,
  };
}

function publishedWork(
  title: string,
  category: WorkCatalogCard['category'],
  index: number,
  publishedDate: string,
): WorkCatalogCard {
  return { ...work(title, category, index), publishedAt: `${publishedDate}T08:00:00.000Z` };
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
