// @vitest-environment jsdom

import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypingAnimation } from './typing-animation';

describe('TypingAnimation hydration', () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: '',
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect() {}
        observe() {}
        takeRecords() {
          return [];
        }
        unobserve() {}
      },
    );
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    if (root !== undefined) act(() => root?.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('hydrates from the same complete word rendered by the server', async () => {
    const element = <TypingAnimation loop showCursor startOnView={false} words={['อริสา ใจดี']} />;
    container.innerHTML = renderToString(element);
    expect(container.textContent).toBe('อริสา ใจดี');
    const onRecoverableError = vi.fn();

    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError });
      await Promise.resolve();
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
  });
});
