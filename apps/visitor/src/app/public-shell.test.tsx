import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PublicShell } from './public-shell';

describe('PublicShell', () => {
  it('provides accessible catalog navigation and a direct path to main content', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="th"
        timeZone="Asia/Bangkok"
        messages={{
          Navigation: {
            academicArticle: 'บทความวิชาการ',
            academicArticleDescription: 'บทความและงานศึกษา',
            allWorks: 'ผลงานทั้งหมด',
            allWorksDescription: 'ดูผลงานเผยแพร่ทุกประเภท',
            ariaLabel: 'เมนูสาธารณะ',
            competitionEntry: 'ผลงานประกวด',
            competitionEntryDescription: 'ผลงานแข่งขัน',
            closeMenu: 'ปิดเมนู',
            courseWork: 'ผลงานรายวิชา',
            courseWorkDescription: 'ผลงานจากรายวิชา',
            home: 'หน้าแรก',
            homeAriaLabel: 'Student Showcase หน้าแรก',
            menuDescription: 'เลือกหน้าหรือประเภทผลงานที่ต้องการดู',
            menuTitle: 'เมนู',
            openMenu: 'เปิดเมนู',
            people: 'นักศึกษา',
            works: 'ผลงาน',
          },
          Shell: {
            brandAlt: 'คณะเทคโนโลยีสารสนเทศ มหาวิทยาลัยศรีปทุม',
            description: 'พื้นที่รวมผลงานจากนักศึกษา CSI',
            skipToContent: 'ข้ามไปยังเนื้อหาหลัก',
            title: 'STUDENT SHOWCASE',
            viewWorks: 'สำรวจผลงานทั้งหมด',
          },
        }}
      >
        <PublicShell>
          <h1>Student Showcase</h1>
        </PublicShell>
      </NextIntlClientProvider>,
    );

    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('href="/works"');
    expect(html).toContain('href="/works?category=course_work"');
    expect(html).toContain('href="/works?category=competition_entry"');
    expect(html).toContain('href="/works?category=academic_article"');
    expect(html).toContain('href="/people"');
    expect(html).toContain('หน้าแรก');
    expect(html).toContain('ผลงาน');
    expect(html).toContain('ผลงานรายวิชา');
    expect(html).toContain('ผลงานประกวด');
    expect(html).toContain('บทความวิชาการ');
    expect(html).toContain('นักศึกษา');
    expect(html).toContain('data-navigation-state="top"');
    expect(html).toContain('shadow-[0_0.75rem_2rem_-1.25rem_rgba(30,18,34,0.28)]');
    expect(html).toContain('data-slot="navigation-menu"');
    expect(html).toContain('data-slot="sheet-trigger"');
    expect(html).toContain('aria-label="เปิดเมนู"');
    expect(html).not.toContain('/#how-it-works');
    expect(html).toContain('csi-computer-science-software-development-innovation-navy.webp');
    expect(html).toContain('sit-school-of-information-technology-color.webp');
    expect(html).toContain('aria-label="Student Showcase หน้าแรก"');
    expect(html).toContain('alt="คณะเทคโนโลยีสารสนเทศ มหาวิทยาลัยศรีปทุม"');
    expect(html).toContain('<footer');
  });
});
