import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudentBrandMark } from './student-brand';

describe('StudentBrandMark', () => {
  afterEach(cleanup);

  it('uses the official CSI mark as a centered home link without stretching it', () => {
    render(<StudentBrandMark />);

    const homeLink = screen.getByRole('link', { name: 'หน้าหลัก Student Showcase' });
    const logo = within(homeLink).getByRole('img', { hidden: true });

    expect(homeLink.getAttribute('href')).toBe('/');
    expect(homeLink.classList.contains('self-center')).toBe(true);
    expect(decodeURIComponent(logo.getAttribute('src') ?? '')).toContain(
      '/brand/csi-computer-science-software-development-innovation.png',
    );
    expect(logo.classList.contains('object-cover')).toBe(true);
    expect(logo.classList.contains('object-left')).toBe(true);
  });
});
