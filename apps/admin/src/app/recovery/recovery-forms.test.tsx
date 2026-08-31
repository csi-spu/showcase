import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import type {
  AdminAttributionRemovalRequest,
  AdminRemovalRequest,
  AdminWorkRecovery,
} from '@/lib/admin-reviews-core';
import {
  AttributionRemovalDecisionForm,
  RecoveryDecisionForm,
  WorkRecoveryPanel,
} from './recovery-forms';

describe('Admin recovery forms', () => {
  afterEach(cleanup);

  it('presents archive and unpublish as separate recoverable controls without hard delete', () => {
    renderForm(<WorkRecoveryPanel action={vi.fn()} idempotencyKey={id(10)} state={work()} />);
    expect(screen.getByRole('button', { name: 'ระงับการเผยแพร่' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'เก็บผลงาน' })).toBeTruthy();
    expect(screen.getAllByText(/ประวัติทั้งหมดจะยังคงอยู่/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/ลบถาวร/)).toBeNull();
  });

  it('keeps restore-active and publication restoration explicit and separate', () => {
    renderForm(
      <WorkRecoveryPanel
        action={vi.fn()}
        idempotencyKey={id(11)}
        state={{ ...work(), activityState: 'archived', publicationState: 'unpublished' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'คืนสถานะใช้งานแบบส่วนตัว' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'คืนการเผยแพร่' })).toBeNull();
  });

  it('asks for a reason only after the Admin chooses to decline', async () => {
    const user = userEvent.setup();
    renderForm(
      <RecoveryDecisionForm action={vi.fn()} idempotencyKey={id(12)} request={request()} />,
    );
    expect(screen.getByText(request().reason)).toBeTruthy();
    expect(screen.queryByLabelText('เหตุผลที่ไม่อนุมัติ')).toBeNull();
    expect(screen.getByRole('button', { name: 'อนุมัติและระงับการเผยแพร่' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'ไม่อนุมัติคำขอ' }));
    expect(screen.getByLabelText('เหตุผลที่ไม่อนุมัติ')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ยืนยันไม่อนุมัติคำขอ' })).toBeTruthy();
  });

  it('renders compact table actions as labelled icons and expands decline details on demand', async () => {
    const user = userEvent.setup();
    renderForm(
      <RecoveryDecisionForm
        action={vi.fn()}
        iconOnly
        idempotencyKey={id(13)}
        request={request()}
      />,
    );

    const approve = screen.getByRole('button', { name: 'อนุมัติและระงับการเผยแพร่' });
    const decline = screen.getByRole('button', { name: 'ไม่อนุมัติคำขอ' });
    expect(approve.textContent).toBe('');
    expect(decline.textContent).toBe('');
    expect(screen.queryByText(request().reason)).toBeNull();

    await user.click(decline);
    expect(screen.getByLabelText('เหตุผลที่ไม่อนุมัติ')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ยืนยันไม่อนุมัติคำขอ' }).textContent).toBe('');
  });

  it('explains that attribution removal creates a reviewed correction', () => {
    const attributionRequest: AdminAttributionRemovalRequest = {
      attributionName: 'Alex Example',
      attributionPublicId: id(23),
      correctionRevisionPublicId: null,
      createdAt: '2026-08-26T05:00:00.000Z',
      currentPublishedRevisionPublicId: id(24),
      currentPublishedRevisionVersion: 3,
      publicId: id(20),
      reason: 'ขอถอนชื่อออกจากผลงานนี้',
      revisionPublicId: id(21),
      state: 'pending',
      version: 1,
      workPublicId: work().publicId,
      workTitle: 'ผลงานตัวอย่าง',
    };
    renderForm(
      <AttributionRemovalDecisionForm
        action={vi.fn()}
        idempotencyKey={id(22)}
        request={attributionRequest}
      />,
    );
    expect(screen.getByText(/สร้างฉบับแก้ไข.*เผยแพร่ทันที/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'อนุมัติและเผยแพร่การนำชื่อออก' })).toBeTruthy();
    expect(screen.queryByText(/ลบถาวร/)).toBeNull();
  });
});

function renderForm(element: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

function id(value: number): string {
  return `79000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}

function work(): AdminWorkRecovery {
  return {
    activityState: 'active',
    publicationState: 'published',
    publicId: '79000000-0000-4000-8000-000000000001',
    publishedRevisionId: '79000000-0000-4000-8000-000000000002',
    publishedRevisionPublicId: '79000000-0000-4000-8000-000000000003',
    version: 1,
  };
}

function request(): AdminRemovalRequest {
  return {
    createdAt: '2026-08-26T05:00:00.000Z',
    decisionReason: null,
    publicId: '79000000-0000-4000-8000-000000000004',
    reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
    revisionPublicId: '79000000-0000-4000-8000-000000000003',
    state: 'pending',
    title: 'ผลงานตัวอย่าง',
    version: 1,
    workPublicId: work().publicId,
    workVersion: 1,
  };
}
