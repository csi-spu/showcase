// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroArtwork } from './hero-artwork';

vi.mock('gsap', () => {
  const applyAutoAlpha = (
    targets: Iterable<HTMLElement>,
    properties: { autoAlpha?: number | ((index: number) => number) },
  ) => {
    Array.from(targets).forEach((target, index) => {
      if (properties.autoAlpha === undefined) return;
      const opacity =
        typeof properties.autoAlpha === 'function'
          ? properties.autoAlpha(index)
          : properties.autoAlpha;
      target.style.opacity = String(opacity);
    });
  };
  const timeline = {
    fromTo: () => timeline,
    set: (targets: Iterable<HTMLElement>, properties: { autoAlpha?: number }) => {
      applyAutoAlpha(targets, properties);
      return timeline;
    },
    to: () => timeline,
  };

  return {
    gsap: {
      context: (setup: () => void) => {
        setup();
        return { revert: () => undefined };
      },
      from: (targets: Iterable<HTMLElement>, properties: { autoAlpha?: number }) =>
        applyAutoAlpha(targets, properties),
      quickTo: () => () => undefined,
      set: applyAutoAlpha,
      timeline: () => timeline,
    },
  };
});

describe('HeroArtwork hydration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query.includes('(hover: hover)'),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('starts the entrance only after every artwork image has loaded', async () => {
    await act(async () => root.render(<HeroArtwork alt="ภาพ Hero" />));
    const firstPiece = container.querySelector<HTMLElement>('[data-hero-piece="1"]');
    const artworkAssets = Array.from(
      container.querySelectorAll<HTMLImageElement>('[data-hero-asset]'),
    );

    expect(firstPiece?.style.opacity).toBe('');
    expect(artworkAssets).toHaveLength(3);

    await act(async () => {
      artworkAssets.forEach((asset) => asset.dispatchEvent(new Event('load', { bubbles: true })));
    });

    expect(firstPiece?.style.opacity).not.toBe('');
    expect(Number(firstPiece?.style.opacity)).toBeLessThan(1);
  });

  it('keeps the first artwork still when the visitor prefers reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    );

    await act(async () => root.render(<HeroArtwork alt="ภาพ Hero" />));
    const artworkAssets = Array.from(
      container.querySelectorAll<HTMLImageElement>('[data-hero-asset]'),
    );

    await act(async () => {
      artworkAssets.forEach((asset) => asset.dispatchEvent(new Event('load', { bubbles: true })));
    });

    const slides = Array.from(container.querySelectorAll<HTMLElement>('[data-hero-slide]'));
    expect(slides.map((slide) => slide.style.opacity)).toEqual(['1', '0', '0']);
  });
});
