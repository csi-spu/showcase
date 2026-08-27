import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomepageQuickSearch } from './homepage-quick-search';
import { QuickSearchProvider } from './quick-search';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Homepage quick search', () => {
  it('renders a centered search trigger between homepage discovery sections', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="th"
        timeZone="Asia/Bangkok"
        messages={{
          QuickSearch: {
            dialogDescription: 'ค้นหาแบบทันทีจาก Public Catalog',
            dialogTitle: 'ค้นหานักศึกษาหรือผลงาน',
            error: 'ค้นหาไม่สำเร็จ กรุณาลองอีกครั้ง',
            loading: 'กำลังค้นหา',
            noResults: 'ไม่พบผลลัพธ์',
            peopleGroup: 'นักศึกษา',
            placeholder: 'ค้นหาชื่อนักศึกษาหรือชื่อผลงาน',
            studentEntryYear: 'ปีที่เข้าศึกษา {year}',
            trigger: 'ค้นหาชื่อนักศึกษาหรือชื่อผลงาน',
            worksGroup: 'ผลงาน',
          },
        }}
      >
        <QuickSearchProvider>
          <HomepageQuickSearch
            placeholderWords={['อริสา ใจดี', 'ระบบจัดการห้องเรียน', 'คุณภาพอากาศ']}
          />
        </QuickSearchProvider>
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-homepage-quick-search="true"');
    expect(html).toContain('data-homepage-quick-search-position="below-hero"');
    expect(html).toContain('data-quick-search-trigger="homepage"');
    expect(html).toContain('ค้นหาชื่อนักศึกษาหรือชื่อผลงาน');
    expect(html).toContain('max-w-4xl');
    expect(html).toContain('rounded-full');
    expect(html).toContain('border-primary/70');
    expect(html).toContain('mt-4');
    expect(html).not.toContain('data-homepage-quick-search-overlap');
    expect(html).not.toContain('absolute inset-x-0 bottom-0');
    expect(html).not.toContain('homepage-quick-search-title');
  });
});
