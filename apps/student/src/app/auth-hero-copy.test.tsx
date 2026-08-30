import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthHeroCopy } from './auth-hero-copy';

describe('Student authentication hero copy', () => {
  it('presents the product name and Student workspace purpose as one semantic block', () => {
    render(<AuthHeroCopy />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'ระบบจัดการผลงานนักศึกษา' }),
    ).toBeDefined();
    expect(screen.getByText('จัดการโปรไฟล์และผลงานของนักศึกษา CSI ในที่เดียว')).toBeDefined();
  });
});
