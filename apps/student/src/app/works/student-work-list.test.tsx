import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkListItem } from '@/lib/student-works-core';
import { StudentWorkList } from './student-work-list';
vi.mock('./work.actions', () => ({
  archiveSavedDraftAction: vi.fn(),
  restoreSavedDraftAction: vi.fn(),
}));

describe('StudentWorkList', () => {
  afterEach(cleanup);
  it('labels displayed source separately from lifecycle dimensions and renders one primary action', () => {
    render(<StudentWorkList canEdit items={[item()]} labels={labels} />);
    expect(screen.getByText('จากร่าง')).toBeTruthy();
    expect(screen.getByText('ใช้งาน')).toBeTruthy();
    expect(screen.getByText('เผยแพร่')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'แก้ไขต่อ' })).toBeTruthy();
  });
});

const labels: Record<string, string> = {
  archiveConfirm: 'ยืนยัน',
  more: 'เพิ่มเติม',
  placeholder: 'ยังไม่มีชื่อ',
  posterFallback: 'ไม่มีโปสเตอร์',
  updatedAt: 'อัปเดต',
  'actions.continue_editing': 'แก้ไขต่อ',
  'activity.active': 'ใช้งาน',
  'publication.published': 'เผยแพร่',
  'review.draft': 'ร่าง',
  'source.draft': 'จากร่าง',
};
function item(): WorkListItem {
  return {
    activityState: 'active',
    academicPeriod: null,
    category: null,
    displayedSource: 'draft',
    hasDraft: true,
    isDraftComplete: false,
    latestRevisionStatus: null,
    poster: null,
    primaryAction: 'continue_editing',
    publicationState: 'published',
    publicId: '64000000-0000-4000-8000-000000000001',
    secondaryActions: [],
    summary: 'สรุป',
    title: 'ผลงาน',
    updatedAt: '2026-08-29T00:00:00.000Z',
    version: 2,
  };
}
