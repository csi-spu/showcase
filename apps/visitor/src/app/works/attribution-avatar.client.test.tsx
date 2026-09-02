// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttributionAvatar } from './attribution-avatar';

const attribution = {
  affiliation: null,
  attributionPublicId: '87000000-0000-4000-8000-000000000005',
  attributionName: 'ชื่อผู้ส่ง snapshot',
  canRequestRemoval: false,
  contributionRole: null,
  hasPhoto: true,
  profilePublicId: '87000000-0000-4000-8000-000000000004',
  studyYear: 2,
};

describe('AttributionAvatar hydration', () => {
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

  it('retries one failed photo request and then shows the initials fallback', async () => {
    await act(async () => root.render(<AttributionAvatar attribution={attribution} />));

    const firstImage = container.querySelector('img');
    expect(firstImage?.getAttribute('src')).not.toContain('retry=1');

    await act(async () => firstImage?.dispatchEvent(new Event('error', { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    const retriedImage = container.querySelector('img');
    expect(retriedImage?.getAttribute('src')).toContain('retry=1');

    await act(async () => retriedImage?.dispatchEvent(new Event('error', { bubbles: true })));
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('ชื');
  });
});
