import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './use-mobile';

describe('useIsMobile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the same media query result as the responsive layout', () => {
    let isMobile = true;
    let notifyChange: (() => void) | undefined;
    const mediaQuery = {
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        notifyChange = listener;
      }),
      get matches() {
        return isMobile;
      },
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery),
    );
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);

    act(() => {
      isMobile = false;
      notifyChange?.();
    });

    expect(result.current).toBe(false);
  });
});
