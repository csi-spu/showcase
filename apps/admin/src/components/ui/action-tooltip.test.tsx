import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionTooltip } from './action-tooltip';

describe('ActionTooltip', () => {
  afterEach(cleanup);

  it('keeps an icon-only action understandable to sighted and screen-reader users', () => {
    render(
      <ActionTooltip label="เปิดตรวจผลงาน">
        <button aria-label="เปิดตรวจผลงาน" type="button">
          <svg aria-hidden="true" />
        </button>
      </ActionTooltip>,
    );

    expect(screen.getByRole('button', { name: 'เปิดตรวจผลงาน' }).textContent).toBe('');
    expect(screen.getByRole('tooltip', { name: 'เปิดตรวจผลงาน' })).toBeTruthy();
  });
});
