import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RosterBatchAutoRefresh } from './roster-batch-auto-refresh';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

describe('RosterBatchAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('refreshes Server Component data every two seconds while mounted', () => {
    const view = render(<RosterBatchAutoRefresh label="ระบบอัปเดตสถานะให้อัตโนมัติ" />);

    expect(screen.getByRole('status').textContent).toContain('ระบบอัปเดตสถานะให้อัตโนมัติ');
    vi.advanceTimersByTime(1_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4_000);
    expect(refresh).toHaveBeenCalledTimes(3);

    view.unmount();
    vi.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
