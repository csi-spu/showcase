import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WordRotate } from './word-rotate';

describe('WordRotate', () => {
  it('renders the first phrase visibly without creating a nested heading', () => {
    const html = renderToStaticMarkup(
      <h1>
        <WordRotate
          accessibleLabel="ผลงานรายวิชา ผลงานประกวด และบทความวิชาการ"
          words={['ผลงานรายวิชา', 'ผลงานประกวด', 'บทความวิชาการ']}
        />
      </h1>,
    );

    expect(html).toContain('ผลงานรายวิชา');
    expect(html).toContain('ผลงานรายวิชา ผลงานประกวด และบทความวิชาการ');
    expect(html).toContain('invisible');
    expect(html).not.toContain('opacity:0');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});
