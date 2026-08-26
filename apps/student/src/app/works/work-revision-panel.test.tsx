import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import type { WorkChangeRequest, WorkRevision } from '@/lib/student-works-core';
import {
  WorkChangeRequestPanel,
  WorkPublishedRevisionPanel,
  WorkRevisionRebasePanel,
  WorkRevisionPendingPanel,
  WorkRevisionSubmissionPanel,
} from './work-revision-panel';

const WORK_PUBLIC_ID = '75000000-0000-4000-8000-000000000001';
const REVISION_PUBLIC_ID = '75000000-0000-4000-8000-000000000002';
const IDEMPOTENCY_KEY = '75000000-0000-4000-8000-000000000003';

describe('Work Revision panels', () => {
  afterEach(cleanup);

  it('requires the Submitter to confirm public Attribution Name and Study Year', () => {
    renderPanel(
      <WorkRevisionSubmissionPanel
        action={vi.fn()}
        basePublishedRevisionId={null}
        draftVersion={4}
        idempotencyKey={IDEMPOTENCY_KEY}
      />,
    );

    expect(screen.getByLabelText('ชื่อผู้ส่งที่จะแสดงต่อสาธารณะ').getAttribute('maxlength')).toBe(
      '100',
    );
    expect(screen.getByLabelText('ชั้นปีเมื่อทำผลงาน (1–8)').getAttribute('max')).toBe('8');
    expect(screen.getByRole('button', { name: 'ส่งผลงานให้ผู้ดูแลตรวจ' })).toBeTruthy();
    expect(
      (document.querySelector('[name="expectedDraftVersion"]') as HTMLInputElement).value,
    ).toBe('4');
  });

  it('clearly distinguishes pending Review and exposes only withdrawal before decision', () => {
    renderPanel(
      <WorkRevisionPendingPanel
        action={vi.fn()}
        idempotencyKey={IDEMPOTENCY_KEY}
        revision={revision()}
      />,
    );

    expect(screen.getByText('รอผู้ดูแลตรวจ')).toBeTruthy();
    expect(screen.getByText('Revision 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ถอนผลงานจากคิวตรวจ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ส่งผลงานให้ผู้ดูแลตรวจ' })).toBeNull();
  });

  it('shows the reason and full actionable feedback above the seeded private Draft', () => {
    renderPanel(<WorkChangeRequestPanel review={changeRequest()} />);

    expect(screen.getByText('ผู้ดูแลขอให้แก้ไขเนื้อหา')).toBeTruthy();
    expect(screen.getByText('กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน')).toBeTruthy();
    expect(screen.getByText('Revision 1')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers an explicit private Draft seed without implying the Published Revision changes', () => {
    renderPanel(
      <WorkPublishedRevisionPanel
        action={vi.fn()}
        idempotencyKey={IDEMPOTENCY_KEY}
        publishedRevisionId={REVISION_PUBLIC_ID}
      />,
    );

    expect(screen.getByText('ผลงานเผยแพร่แล้ว')).toBeTruthy();
    expect(screen.getByText(/ฉบับที่เผยแพร่ยังคงแสดงต่อสาธารณะ/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'สร้างร่าง Revision ใหม่' })).toBeTruthy();
  });

  it('requires explicit rebase for a stale Draft and explains that local content is retained', () => {
    renderPanel(
      <WorkRevisionRebasePanel
        action={vi.fn()}
        draftVersion={4}
        idempotencyKey={IDEMPOTENCY_KEY}
        publishedRevisionId={REVISION_PUBLIC_ID}
      />,
    );

    expect(screen.getByText('ร่างนี้อ้างอิงฉบับเผยแพร่เก่า')).toBeTruthy();
    expect(screen.getByText(/เนื้อหาในร่างปัจจุบันจะยังอยู่ครบ/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'รีเบสร่างกับฉบับเผยแพร่ล่าสุด' })).toBeTruthy();
    expect((document.querySelector('[name="expectedVersion"]') as HTMLInputElement).value).toBe(
      '4',
    );
  });
});

function renderPanel(element: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

function changeRequest(): WorkChangeRequest {
  return {
    decision: 'changes_requested',
    feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
    publicId: '75000000-0000-4000-8000-000000000004',
    reason: 'content',
    revisionNumber: 1,
    revisionPublicId: REVISION_PUBLIC_ID,
    reviewedAt: '2026-08-25T16:00:00.000Z',
    workPublicId: WORK_PUBLIC_ID,
  };
}

function revision(): WorkRevision {
  return {
    attributions: [],
    content: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียด',
      links: [],
      summary: 'สรุป',
      tags: [],
      title: 'ผลงาน',
      videoLinks: [],
    },
    media: [],
    number: 1,
    publicId: REVISION_PUBLIC_ID,
    status: 'pending_review',
    submittedAt: '2026-08-25T15:00:00.000Z',
    version: 1,
    withdrawnAt: null,
    workPublicId: WORK_PUBLIC_ID,
  };
}
