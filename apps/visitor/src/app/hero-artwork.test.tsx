import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeroArtwork } from './hero-artwork';

describe('HeroArtwork', () => {
  it('renders an accessible digital-product image assembled from animation pieces', () => {
    const html = renderToStaticMarkup(
      <HeroArtwork alt="นักศึกษากำลังออกแบบเว็บและแอปพลิเคชันร่วมกัน" />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="นักศึกษากำลังออกแบบเว็บและแอปพลิเคชันร่วมกัน"');
    expect(html.match(/data-hero-slide=/g)).toHaveLength(3);
    expect(html.match(/data-hero-piece=/g)).toHaveLength(18);
    expect(html).toContain('showcase-hero-digital-students.png');
    expect(html).toContain('showcase-hero-digital-students-2.png');
    expect(html).toContain('showcase-hero-digital-students-3.png');
    expect(html).toContain('var(--primary)');
    expect(html).not.toContain('showcase-hero-web-app.png');
    expect(html).not.toContain('showcase-hero-web-app-badge.png');
  });

  it('keeps the first image visible before hydration while later images wait behind it', () => {
    const html = renderToStaticMarkup(<HeroArtwork alt="ภาพ Hero" />);

    expect(html).toContain('data-hero-slide="1"');
    expect(html).toContain('data-hero-slide="2"');
    expect(html).toContain('data-hero-slide="3"');
    expect(html.match(/opacity:0/g)).toHaveLength(2);
  });
});
