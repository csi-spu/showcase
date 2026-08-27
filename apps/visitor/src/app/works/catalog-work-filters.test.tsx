import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogWorkFilters } from './catalog-work-filters';

const labels = {
  academicYear: 'ปีการศึกษา',
  advancedFilters: 'ตัวกรองเพิ่มเติม',
  all: 'ทั้งหมด',
  apply: 'ค้นหา',
  category: 'ประเภทผลงาน',
  categoryAcademicArticle: 'บทความวิชาการ',
  categoryCompetitionEntry: 'ผลงานประกวด',
  categoryCourseWork: 'ผลงานรายวิชา',
  filterCount: (count: number) => `เลือกอยู่ ${count} ตัวกรอง`,
  reset: 'ล้างตัวกรอง',
  searchWorks: 'ค้นหาผลงาน',
  searchWorksPlaceholder: 'ชื่อผลงานหรือคำที่สนใจ',
  semester: 'ภาค',
  semesterSummer: 'ฤดูร้อน',
  sort: 'เรียงตาม',
  sortAcademicPeriod: 'ช่วงการศึกษา',
  sortRecent: 'เผยแพร่ล่าสุด',
  sortTitle: 'ชื่อผลงาน',
  tags: 'หัวข้อที่สนใจ',
};

describe('Public Catalog Work filters', () => {
  it('keeps optional filters collapsed on the initial visit', () => {
    const html = renderToStaticMarkup(
      <CatalogWorkFilters labels={labels} params={{}} tags={[tag('UX')]} />,
    );

    expect(html).toContain('data-slot="advanced-filters"');
    expect(html).not.toContain('open=""');
    expect(html).toContain('data-slot="input-group"');
    expect(html.match(/data-slot="native-select"/g)).toHaveLength(3);
  });

  it('opens optional filters and reports their active count when selected', () => {
    const html = renderToStaticMarkup(
      <CatalogWorkFilters
        labels={labels}
        params={{
          category: ['course_work', 'academic_article'],
          semester: 'summer',
          tag: tag('UX').publicId,
        }}
        tags={[tag('UX')]}
        years={[2569, 2568]}
      />,
    );

    expect(html).toContain('open=""');
    expect(html).toContain('เลือกอยู่ 4 ตัวกรอง');
    expect(html).toContain('href="/works"');
    expect(html).toMatch(/<option[^>]+value="2569">2569<\/option>/);
  });
});

function tag(displayLabel: string) {
  return {
    activeWorkCount: 2,
    displayLabel,
    publicId: '9d000000-0000-4000-8000-000000000001',
  };
}
