import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomepageBrandMarquee } from './homepage-brand-marquee';

describe('Homepage brand marquee', () => {
  it('shows subdued white CSI, SIT, and SPU logos without logo frames', () => {
    const html = renderToStaticMarkup(
      <HomepageBrandMarquee
        csiLogoAlt="วิทยาการคอมพิวเตอร์และนวัตกรรมการพัฒนาซอฟต์แวร์"
        label="CSI Student Showcase ภายใต้คณะเทคโนโลยีสารสนเทศ"
        sitLogoAlt="คณะเทคโนโลยีสารสนเทศ มหาวิทยาลัยศรีปทุม"
        spuLogoAlt="มหาวิทยาลัยศรีปทุม"
      />,
    );

    expect(html).toContain('data-homepage-brand-marquee="true"');
    expect(html).toContain('data-homepage-brand-marquee-size="compact"');
    expect(html).toContain('csi-computer-science-software-development-innovation.png');
    expect(html).toContain('sit-school-of-information-technology-color.webp');
    expect(html).toContain('new_logo_spu01.gif');
    expect(html.match(/data-brand-logo-frame="none"/g)).toHaveLength(6);
    expect(html.match(/data-brand-logo-image="monochrome"/g)).toHaveLength(6);
    expect(html).toContain('brightness-0 invert opacity-45');
    expect(html.match(/data-tech-glyph=/g)).toHaveLength(6);
    expect(html.match(/data-tech-glyph-frame="none"/g)).toHaveLength(6);
    expect(html).toMatch(
      /csi-computer-science-software-development-innovation\.png[\s\S]*data-tech-glyph="code"[\s\S]*sit-school-of-information-technology-color\.webp[\s\S]*data-tech-glyph="data"[\s\S]*new_logo_spu01\.gif[\s\S]*data-tech-glyph="network"/,
    );
    expect(html).toContain('aria-label="CSI Student Showcase ภายใต้คณะเทคโนโลยีสารสนเทศ"');
    expect(html).toContain('motion-reduce:animate-none');
    expect(html).toContain('motion-reduce:hidden');
    expect(html).toContain('max-w-xl');
    expect(html).toContain('mt-9');
    expect(html).toContain('h-12');
  });
});
