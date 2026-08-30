import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

import { WorkListControls } from './work-list-controls';

describe('WorkListControls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('searches from the first character after a short debounce and resets pagination', async () => {
    render(
      <WorkListControls
        labels={labels}
        value={{
          category: 'all',
          page: 3,
          query: '',
          sort: 'updated_desc',
          status: 'all',
          view: 'current',
        }}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหาผลงาน' }), {
      target: { value: 'ก' },
    });
    expect(replace).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(replace).toHaveBeenCalledWith('/works?view=current&query=%E0%B8%81', {
      scroll: false,
    });
  });

  it('shows Thai labels for the selected filters instead of their internal values', () => {
    render(
      <WorkListControls
        labels={labels}
        value={{
          category: 'all',
          page: 1,
          query: '',
          sort: 'updated_desc',
          status: 'all',
          view: 'current',
        }}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'ประเภท' }).textContent).toContain('ทุกประเภท');
    expect(screen.getByRole('combobox', { name: 'สถานะ' }).textContent).toContain('ทุกสถานะ');
    expect(screen.getByRole('combobox', { name: 'เรียงลำดับ' }).textContent).toContain(
      'อัปเดตล่าสุด',
    );
  });

  it('syncs an externally changed query without replacing the search input', () => {
    const value = {
      category: 'all' as const,
      page: 1,
      query: '',
      sort: 'updated_desc' as const,
      status: 'all' as const,
      view: 'current' as const,
    };
    const view = render(<WorkListControls labels={labels} value={value} />);
    const input = screen.getByRole('searchbox', { name: 'ค้นหาผลงาน' });
    input.focus();

    view.rerender(<WorkListControls labels={labels} value={{ ...value, query: 'ผลงานเว็บ' }} />);

    expect(screen.getByRole('searchbox', { name: 'ค้นหาผลงาน' })).toBe(input);
    expect((input as HTMLInputElement).value).toBe('ผลงานเว็บ');
    expect(document.activeElement).toBe(input);
  });

  it('preserves newer typing when an earlier search result arrives', async () => {
    const value = {
      category: 'all' as const,
      page: 1,
      query: '',
      sort: 'updated_desc' as const,
      status: 'all' as const,
      view: 'current' as const,
    };
    const view = render(<WorkListControls labels={labels} value={value} />);
    const input = screen.getByRole('searchbox', { name: 'ค้นหาผลงาน' });
    input.focus();

    fireEvent.change(input, { target: { value: 'เว็บ' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(input, { target: { value: 'เว็บไซต์' } });
    view.rerender(<WorkListControls labels={labels} value={{ ...value, query: 'เว็บ' }} />);

    expect((input as HTMLInputElement).value).toBe('เว็บไซต์');
    expect(document.activeElement).toBe(input);
  });
});

const labels = {
  category: 'ประเภท',
  categoryAll: 'ทุกประเภท',
  categoryAcademicArticle: 'บทความวิชาการ',
  categoryCompetitionEntry: 'ผลงานประกวด',
  categoryCourseWork: 'ผลงานรายวิชา',
  search: 'ค้นหาผลงาน',
  searchPlaceholder: 'ค้นหาจากชื่อหรือคำอธิบาย',
  sort: 'เรียงลำดับ',
  sortNewest: 'อัปเดตล่าสุด',
  sortOldest: 'อัปเดตเก่าสุด',
  status: 'สถานะ',
  statusAll: 'ทุกสถานะ',
  statusChangesRequested: 'ต้องแก้ไข',
  statusDraft: 'ฉบับร่าง',
  statusPendingReview: 'กำลังรอตรวจ',
  statusPublished: 'เผยแพร่แล้ว',
};
