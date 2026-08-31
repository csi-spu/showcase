import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImageCarousel } from './image-carousel';

const labels = {
  next: 'ภาพถัดไป',
  previous: 'ภาพก่อนหน้า',
};

describe('ImageCarousel', () => {
  it('renders the first slide with controls and a dot per slide', () => {
    const html = renderToStaticMarkup(
      <ImageCarousel
        labels={labels}
        slides={[
          {
            alt: 'ภาพที่ 1',
            dominantColor: '#285078',
            dotLabel: 'ไปภาพที่ 1',
            height: 1000,
            src: '/works/1/media/a/1600',
            srcSet: '/works/1/media/a/1600 1600w',
            width: 1600,
          },
          {
            alt: 'ภาพที่ 2',
            dominantColor: '#3A5A78',
            dotLabel: 'ไปภาพที่ 2',
            height: 1000,
            src: '/works/1/media/b/1600',
            srcSet: '/works/1/media/b/1600 1600w',
            width: 1600,
          },
        ]}
      />,
    );

    expect(html).toContain('alt="ภาพที่ 1"');
    expect(html).toContain('src="/works/1/media/a/1600"');
    expect(html).not.toContain('src="/works/1/media/b/1600"');
    expect(html).toContain('aria-label="ภาพก่อนหน้า"');
    expect(html).toContain('aria-label="ภาพถัดไป"');
    expect(html.match(/aria-label="ไปภาพที่ \d"/g)).toHaveLength(2);
    expect(html).toContain('aria-current="true"');
  });

  it('hides prev/next controls and dots for a single slide', () => {
    const html = renderToStaticMarkup(
      <ImageCarousel
        labels={labels}
        slides={[
          {
            alt: 'ภาพเดียว',
            dominantColor: '#285078',
            dotLabel: 'ไปภาพที่ 1',
            height: 1000,
            src: '/works/1/media/a/1600',
            srcSet: '/works/1/media/a/1600 1600w',
            width: 1600,
          },
        ]}
      />,
    );

    expect(html).toContain('alt="ภาพเดียว"');
    expect(html).not.toContain('aria-label="ภาพก่อนหน้า"');
    expect(html).not.toContain('aria-label="ภาพถัดไป"');
  });

  it('renders nothing for an empty slide list', () => {
    const html = renderToStaticMarkup(<ImageCarousel labels={labels} slides={[]} />);

    expect(html).toBe('');
  });
});
