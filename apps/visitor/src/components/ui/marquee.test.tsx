import { renderToStaticMarkup } from 'react-dom/server';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import { Marquee } from './marquee';

describe('Marquee', () => {
  it('keeps repeated links out of the accessibility tree and keyboard order', () => {
    const html = renderToStaticMarkup(
      <Marquee repeat={3}>
        <Link href="/tags/example">ตัวอย่าง</Link>
      </Marquee>,
    );

    expect(html.match(/href="\/tags\/example"/g)).toHaveLength(3);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html.match(/inert=""/g)).toHaveLength(2);
  });
});
