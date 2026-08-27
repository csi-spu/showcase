import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InteractiveGridPattern } from './interactive-grid-pattern';

describe('InteractiveGridPattern', () => {
  it('scales one continuous grid across the full SVG viewport', () => {
    const html = renderToStaticMarkup(
      <InteractiveGridPattern height={40} squares={[18, 13]} width={40} />,
    );

    expect(html).toContain('viewBox="0 0 720 520"');
    expect(html).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(html.match(/data-grid-lines=/g)).toHaveLength(1);
    expect(html).toContain('vector-effect="non-scaling-stroke"');
  });
});
