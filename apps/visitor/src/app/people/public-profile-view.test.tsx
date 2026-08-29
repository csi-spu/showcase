import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicProfileView } from './public-profile-view';

describe('Visitor Public Profile UI', () => {
  it('renders only public fields, safe links, and a consent-checked same-origin photo', () => {
    const html = renderToStaticMarkup(
      <PublicProfileView
        labels={{
          bioFallback: 'ยังไม่ได้เพิ่มเรื่องราวแนะนำตัว',
          entryYear: 'ปีที่เข้าศึกษา 2569',
          eyebrow: 'นักศึกษา CSI',
          linksFallback: 'ยังไม่มีลิงก์ภายนอก',
          links: 'ลิงก์ภายนอก',
          photoAlt: 'รูปโปรไฟล์ของ ณัฐดนัย',
        }}
        profile={{
          bio: 'สนใจระบบเว็บ',
          entryYear: 2569,
          firstName: 'ณัฐดนัย',
          lastName: 'สุขใจ',
          links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
          photo: { height: 512, url: 'https://private-media.example/object', width: 512 },
          publicId: '81000000-0000-4000-8000-000000000001',
        }}
      />,
    );

    expect(html).toContain('ณัฐดนัย');
    expect(html).toContain('ปีที่เข้าศึกษา 2569');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('src="/people/81000000-0000-4000-8000-000000000001/photo"');
    expect(html).not.toContain('/_next/image');
    expect(html).not.toContain('private-media.example');
    expect(html).not.toMatch(/studentId|account|session/i);
  });

  it('renders themed fallbacks when optional public profile details are absent', () => {
    const html = renderToStaticMarkup(
      <PublicProfileView
        labels={{
          bioFallback: 'ยังไม่ได้เพิ่มเรื่องราวแนะนำตัว',
          entryYear: 'ปีที่เข้าศึกษา 2569',
          eyebrow: 'นักศึกษา CSI',
          links: 'ติดตามผลงานเพิ่มเติม',
          linksFallback: 'ยังไม่มีลิงก์ภายนอก',
          photoAlt: 'รูปโปรไฟล์ของ ณัฐดนัย',
        }}
        profile={{
          bio: '   ',
          entryYear: 2569,
          firstName: 'ณัฐดนัย',
          lastName: 'สุขใจ',
          links: [],
          photo: null,
          publicId: '81000000-0000-4000-8000-000000000001',
        }}
      />,
    );

    expect(html).toContain('ยังไม่ได้เพิ่มเรื่องราวแนะนำตัว');
    expect(html).toContain('ยังไม่มีลิงก์ภายนอก');
    expect(html).toContain('data-profile-photo-fallback="true"');
  });
});
