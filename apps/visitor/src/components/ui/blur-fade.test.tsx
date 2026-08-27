import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlurFade } from './blur-fade';

describe('BlurFade', () => {
  it.each([
    ['above the fold', false],
    ['observed on scroll', true],
  ])('keeps %s content visible before hydration', (_, inView) => {
    const html = renderToStaticMarkup(
      <BlurFade blur="8px" inView={inView}>
        <p>ผลงานนักศึกษา CSI</p>
      </BlurFade>,
    );

    expect(html).toContain('ผลงานนักศึกษา CSI');
    expect(html).toContain('opacity:1');
    expect(html).not.toContain('opacity:0');
    expect(html).not.toContain('filter:blur(8px)');
  });
});
