// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkPosterImage } from './work-poster-image';

const poster = {
  assetId: '9a000000-0000-4000-8000-000000000001',
  dominantColor: '#285078',
  height: 1800,
  variants: [
    { height: 720, width: 480 },
    { height: 1080, width: 720 },
  ],
  width: 1200,
};

describe('WorkPosterImage hydration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries one failed Poster request and then shows the supplied fallback', async () => {
    await act(async () =>
      root.render(
        <WorkPosterImage
          alt="โปสเตอร์ผลงาน"
          className="object-cover"
          fallback={<div data-poster-fallback="true">fallback</div>}
          loading="lazy"
          poster={poster}
          sizes="100vw"
          workPublicId="9b000000-0000-4000-8000-000000000001"
        />,
      ),
    );

    const firstImage = container.querySelector('img');
    expect(firstImage?.getAttribute('src')).not.toContain('retry=1');

    await act(async () => firstImage?.dispatchEvent(new Event('error', { bubbles: true })));
    expect(container.querySelector('[data-poster-fallback="true"]')).not.toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(500));
    const retriedImage = container.querySelector('img');
    expect(retriedImage?.getAttribute('src')).toContain('retry=1');
    expect(container.querySelector('source')?.getAttribute('srcset')).toContain('?retry=1 480w');

    await act(async () => retriedImage?.dispatchEvent(new Event('error', { bubbles: true })));
    expect(container.querySelector('[data-poster-fallback="true"]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
