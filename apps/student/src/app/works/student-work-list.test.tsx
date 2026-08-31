import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkListItem } from '@/lib/student-works-core';
import { StudentWorkList } from './student-work-list';
vi.mock('./work.actions', () => ({
  archiveSavedDraftAction: vi.fn(),
  restoreSavedDraftAction: vi.fn(),
}));

describe('StudentWorkList', () => {
  afterEach(cleanup);
  it('labels lifecycle dimensions and makes the whole card the primary action', () => {
    render(<StudentWorkList canEdit items={[item()]} labels={labels} />);
    expect(screen.getByText('จากร่าง')).toBeTruthy();
    expect(screen.getByText('ใช้งาน')).toBeTruthy();
    expect(screen.getByText('เผยแพร่')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'แก้ไขต่อ: ผลงาน' }).querySelector('[data-slot="card"]'),
    ).toBeTruthy();
  });

  it('loads a private Poster directly so the browser sends its Student session cookie', () => {
    const work = item({
      poster: {
        assetId: '64000000-0000-4000-8000-000000000002',
        height: 1_600,
        variants: [{ height: 1_600, width: 1_200 }],
        width: 1_200,
      },
    });
    render(<StudentWorkList canEdit items={[work]} labels={labels} />);

    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      `/works/${work.publicId}/media/${work.poster?.assetId}/1200`,
    );
  });

  it('floats an accessible secondary menu outside the card link and removes the footer', () => {
    render(
      <StudentWorkList
        canEdit
        items={[
          item({
            primaryAction: 'view_public_work',
            publicationState: 'never_published',
            secondaryActions: ['create_new_revision'],
          }),
        ]}
        labels={labels}
      />,
    );

    const cardLink = screen.getByRole('link', { name: 'ดูผลงานสาธารณะ: ผลงาน' });
    const menuLabel = screen.getByText('เพิ่มเติม');
    const menuTrigger = menuLabel.closest('summary');

    expect(cardLink.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(cardLink.contains(menuTrigger)).toBe(false);
    expect(menuLabel.classList).toContain('sr-only');
    expect(menuTrigger?.classList).toContain('size-11');
    expect(document.querySelector('[data-slot="card-footer"]')).toBeNull();
  });

  it('does not offer secondary actions for a Published Work', () => {
    render(
      <StudentWorkList
        canEdit
        items={[
          item({
            primaryAction: 'view_public_work',
            publicationState: 'published',
            secondaryActions: ['create_new_revision'],
          }),
        ]}
        labels={labels}
      />,
    );

    expect(screen.getByRole('link', { name: 'ดูผลงานสาธารณะ: ผลงาน' })).toBeTruthy();
    expect(screen.queryByText('เพิ่มเติม')).toBeNull();
    expect(screen.queryByText('สร้างฉบับแก้ไข')).toBeNull();
  });

  it('shows a recoverable error when restoring a saved draft fails', async () => {
    const restore = vi.mocked((await import('./work.actions')).restoreSavedDraftAction);
    restore.mockResolvedValue({ error: 'conflict', outcome: 'error' });
    const user = userEvent.setup();
    render(
      <StudentWorkList
        canEdit
        items={[
          item({
            primaryAction: 'return_to_editing',
            publicationState: 'never_published',
          }),
        ]}
        labels={labels}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'กลับไปแก้ไข' }));
    expect(screen.getByRole('alert').textContent).toContain('ข้อมูลเปลี่ยนแล้ว');
  });
});

const labels: Record<string, string> = {
  archiveConfirm: 'ยืนยัน',
  actionErrorConflict: 'ข้อมูลเปลี่ยนแล้ว',
  actionErrorUnavailable: 'ดำเนินการไม่ได้',
  more: 'เพิ่มเติม',
  placeholder: 'ยังไม่มีชื่อ',
  posterFallback: 'ไม่มีโปสเตอร์',
  updatedAt: 'อัปเดต',
  'actions.continue_editing': 'แก้ไขต่อ',
  'actions.create_new_revision': 'สร้างฉบับแก้ไข',
  'actions.return_to_editing': 'กลับไปแก้ไข',
  'actions.view_public_work': 'ดูผลงานสาธารณะ',
  'activity.active': 'ใช้งาน',
  'publication.never_published': 'ยังไม่เคยเผยแพร่',
  'publication.published': 'เผยแพร่',
  'review.draft': 'ร่าง',
  'source.draft': 'จากร่าง',
};
function item(overrides: Partial<WorkListItem> = {}): WorkListItem {
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
    ...overrides,
  };
}
