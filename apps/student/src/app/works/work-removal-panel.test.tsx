import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import type { RemovalRequest } from '@/lib/student-works-core';
import { WorkRemovalPanel } from './work-removal-panel';

const WORK_PUBLIC_ID = '76000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '76000000-0000-4000-8000-000000000002';

describe('WorkRemovalPanel', () => {
  afterEach(cleanup);

  it('explains that a request does not immediately change public visibility', () => {
    renderPanel(null);
    expect(screen.getByText(/คำขอนี้ไม่ได้นำผลงานออกทันที/)).toBeTruthy();
    expect(screen.getByLabelText('เหตุผลที่ขอนำผลงานออกจากการเผยแพร่')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ส่งคำขอนำออก' })).toBeTruthy();
    expect(screen.queryByText(/ลบถาวร/)).toBeNull();
  });

  it('shows retained pending status and only a cancel action', () => {
    renderPanel(request());
    expect(screen.getByText('รอผู้ดูแลพิจารณา')).toBeTruthy();
    expect(screen.getByText(request().reason)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ยกเลิกคำขอ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ส่งคำขอนำออก' })).toBeNull();
  });
});

function renderPanel(removalRequest: RemovalRequest | null) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <WorkRemovalPanel
        cancelAction={vi.fn()}
        createAction={vi.fn()}
        idempotencyKey={IDEMPOTENCY_KEY}
        removalRequest={removalRequest}
        workVersion={2}
      />
    </NextIntlClientProvider>,
  );
}

function request(): RemovalRequest {
  return {
    createdAt: '2026-08-26T05:00:00.000Z',
    decisionReason: null,
    publicId: '76000000-0000-4000-8000-000000000003',
    reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
    revisionPublicId: '76000000-0000-4000-8000-000000000004',
    state: 'pending',
    title: 'ผลงานตัวอย่าง',
    version: 1,
    workVersion: 2,
    workPublicId: WORK_PUBLIC_ID,
  };
}
