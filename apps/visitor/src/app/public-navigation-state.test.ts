import { describe, expect, it } from 'vitest';
import { deriveNavigationScrollState } from './public-navigation-state';

describe('deriveNavigationScrollState', () => {
  it('keeps the full navigation visible at the top', () => {
    expect(
      deriveNavigationScrollState({ currentY: 12, isReducedMotion: false, previousY: 80 }),
    ).toEqual({ isAtTop: true, isVisible: true });
  });

  it('hides compact navigation while scrolling down into content', () => {
    expect(
      deriveNavigationScrollState({ currentY: 180, isReducedMotion: false, previousY: 140 }),
    ).toEqual({ isAtTop: false, isVisible: false });
  });

  it('reveals compact navigation as soon as the visitor scrolls up', () => {
    expect(
      deriveNavigationScrollState({ currentY: 140, isReducedMotion: false, previousY: 180 }),
    ).toEqual({ isAtTop: false, isVisible: true });
  });

  it('restores the full navigation when returning to the top region', () => {
    const hiddenState = deriveNavigationScrollState({
      currentY: 180,
      isReducedMotion: false,
      previousY: 140,
    });
    const compactState = deriveNavigationScrollState({
      currentY: 140,
      isReducedMotion: false,
      previousY: 180,
    });
    const restoredState = deriveNavigationScrollState({
      currentY: 48,
      isReducedMotion: false,
      previousY: 140,
    });

    expect([hiddenState, compactState, restoredState]).toEqual([
      { isAtTop: false, isVisible: false },
      { isAtTop: false, isVisible: true },
      { isAtTop: true, isVisible: true },
    ]);
  });

  it('never hides navigation when reduced motion is requested', () => {
    expect(
      deriveNavigationScrollState({ currentY: 180, isReducedMotion: true, previousY: 140 }),
    ).toEqual({ isAtTop: false, isVisible: true });
  });
});
