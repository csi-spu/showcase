// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogSearchField } from './catalog-search-field';

describe('CatalogSearchField', () => {
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

  it('loads scoped suggestions after the visitor enters a valid query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          people: [{ entryYear: 2566, name: 'อริสา', publicId: crypto.randomUUID() }],
          works: [
            {
              attribution: 'อริสา',
              publicId: crypto.randomUUID(),
              title: 'ระบบจัดการห้องเรียน',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await act(async () =>
      root.render(
        <CatalogSearchField
          defaultValue=""
          id="work-search"
          label="ค้นหาผลงาน"
          placeholder="ชื่อผลงาน"
          scope="works"
        />,
      ),
    );
    const input = container.querySelector<HTMLInputElement>('input[name="q"]');
    expect(input?.getAttribute('list')).toBe('work-search-suggestions');

    await act(async () => {
      if (input === null) throw new Error('search input missing');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'ระบบ',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quick-search?q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(Array.from(container.querySelectorAll('option')).map((option) => option.value)).toEqual([
      'ระบบจัดการห้องเรียน',
    ]);
  });
});
