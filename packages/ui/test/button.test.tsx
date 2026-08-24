import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';

afterEach(cleanup);

describe('cn', () => {
  it('merges conditional classes and lets the last Tailwind class win', () => {
    expect(cn('px-2', { hidden: false }, ['font-medium', 'px-4'])).toBe('font-medium px-4');
  });
});

describe('Button', () => {
  it.each([
    ['default', 'bg-primary'],
    ['outline', 'border-border'],
    ['secondary', 'bg-secondary'],
    ['ghost', 'hover:bg-muted'],
    ['destructive', 'bg-destructive/10'],
    ['link', 'text-primary'],
  ] as const)('renders the %s variant and selected size', (variant, expectedClass) => {
    render(
      <Button variant={variant} size="lg">
        ตรวจสอบ
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'ตรวจสอบ' });

    expect(button.getAttribute('data-slot')).toBe('button');
    expect(button.classList.contains(expectedClass)).toBe(true);
    expect(button.classList.contains('h-9')).toBe(true);
  });

  it('preserves class-name override semantics', () => {
    render(<Button className="h-12">เผยแพร่</Button>);

    const button = screen.getByRole('button', { name: 'เผยแพร่' });

    expect(button.classList.contains('h-12')).toBe(true);
    expect(button.classList.contains('h-8')).toBe(false);
  });

  it('supports ref and keyboard focus activation', async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const user = userEvent.setup();

    render(
      <Button ref={ref} onClick={onClick}>
        อนุมัติ
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'อนุมัติ' });
    await user.tab();

    expect(ref.current).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.classList.contains('focus-visible:ring-3')).toBe(true);

    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('prevents disabled pointer and keyboard activation', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button disabled onClick={onClick}>
        ปิดใช้งาน
      </Button>,
    );

    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'ปิดใช้งาน' });
    await user.tab();
    await user.keyboard('{Enter}');
    await user.click(button);

    expect(button.disabled).toBe(true);
    expect(document.activeElement).not.toBe(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
