import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponseViewSwitch } from './response-view-switch';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

afterEach(cleanup);

describe('ResponseViewSwitch', () => {
  it('links every view and marks the one shown as the current page', () => {
    render(
      <ResponseViewSwitch
        current="question"
        views={[
          { href: '/s?view=summary', view: 'summary' },
          { href: '/s?view=question', view: 'question' },
          { href: '/s', view: 'individual' },
        ]}
      />,
    );

    const navigation = screen.getByRole('navigation', { name: 'viewsLabel' });
    expect(navigation).toBeTruthy();
    expect(screen.getByRole('link', { name: 'views.question' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'views.summary' }).getAttribute('aria-current')).toBe(
      null,
    );
    expect(screen.getByRole('link', { name: 'views.individual' }).getAttribute('href')).toBe('/s');
  });

  it('slides its highlight by transform only, and not at all under reduced motion', () => {
    const { container } = render(
      <ResponseViewSwitch
        current="individual"
        views={[
          { href: '/s?view=summary', view: 'summary' },
          { href: '/s', view: 'individual' },
        ]}
      />,
    );

    const highlight = container.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(highlight?.style.transform).toBe('translateX(100%)');
    expect(highlight?.className).toContain('transition-transform');
    expect(highlight?.className).toContain('motion-reduce:transition-none');
  });
});
