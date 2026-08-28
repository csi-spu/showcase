import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkListItem } from '@/lib/student-works-core';
import { StudentWorkList } from './student-work-list';

const LABELS = {
  actions: {
    editDraft: 'แก้ไขร่าง',
    editRequested: 'แก้ไขตามคำขอ',
    manage: 'ดูและจัดการ',
    view: 'ดูสถานะ',
  },
  publication: {
    never_published: 'ยังไม่เคยเผยแพร่',
    published: 'เผยแพร่อยู่',
    unpublished: 'นำออกจากการเผยแพร่',
  },
  status: {
    archived: 'เก็บถาวร',
    changes_requested: 'ต้องแก้ไข',
    draft: 'ฉบับร่าง',
    pending_review: 'กำลังรอตรวจ',
    published: 'ผ่านการตรวจแล้ว',
    unpublished: 'ไม่ได้เผยแพร่',
  },
  updatedAt: 'อัปเดตล่าสุด',
} as const;

describe('StudentWorkList', () => {
  afterEach(cleanup);

  it('shows workflow and publication states separately with truthful actions', () => {
    const items: WorkListItem[] = [
      work({ publicId: '64000000-0000-4000-8000-000000000001' }),
      work({
        hasDraft: false,
        latestRevisionStatus: 'pending_review',
        publicId: '64000000-0000-4000-8000-000000000002',
        title: 'รอตรวจ',
      }),
      work({
        latestRevisionStatus: 'changes_requested',
        publicId: '64000000-0000-4000-8000-000000000003',
        title: 'ต้องแก้',
      }),
      work({
        activityState: 'archived',
        hasDraft: false,
        publicationState: 'unpublished',
        publicId: '64000000-0000-4000-8000-000000000004',
        title: 'เก็บถาวร',
      }),
    ];

    render(<StudentWorkList canEdit items={items} labels={LABELS} />);

    const draft = screen.getByRole('listitem', { name: 'ร่างที่เผยแพร่อยู่' });
    expect(within(draft).getByText('ฉบับร่าง')).toBeTruthy();
    expect(within(draft).getByText('เผยแพร่อยู่')).toBeTruthy();
    expect(within(draft).getByRole('link', { name: 'แก้ไขร่าง' })).toBeTruthy();
    expect(
      within(screen.getByRole('listitem', { name: 'รอตรวจ' })).getByRole('link', {
        name: 'ดูสถานะ',
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('listitem', { name: 'ต้องแก้' })).getByRole('link', {
        name: 'แก้ไขตามคำขอ',
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('listitem', { name: 'เก็บถาวร' })).getByRole('link', {
        name: 'ดูสถานะ',
      }),
    ).toBeTruthy();
  });

  it('does not offer edit links when Student capabilities ended', () => {
    render(<StudentWorkList canEdit={false} items={[work()]} labels={LABELS} />);

    expect(screen.queryByRole('link')).toBeNull();
  });
});

function work(overrides: Partial<WorkListItem> = {}): WorkListItem {
  return {
    activityState: 'active',
    hasDraft: true,
    latestRevisionStatus: null,
    publicationState: 'published',
    publicId: '64000000-0000-4000-8000-000000000001',
    title: 'ร่างที่เผยแพร่อยู่',
    updatedAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  };
}
