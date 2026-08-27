import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextAnimate } from './text-animate';

describe('TextAnimate', () => {
  it.each([
    ['immediately animated', false],
    ['observed on scroll', true],
  ])('keeps %s text visible before hydration', (_, startOnView) => {
    const html = renderToStaticMarkup(
      <TextAnimate as="span" by="word" startOnView={startOnView}>
        พื้นที่รวมผลงานของนักศึกษา CSI
      </TextAnimate>,
    );

    expect(html).toContain('พื้นที่รวมผลงานของนักศึกษา CSI');
    expect(html).not.toContain('opacity:0');
  });
});
