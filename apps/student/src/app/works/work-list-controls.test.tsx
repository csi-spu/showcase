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
