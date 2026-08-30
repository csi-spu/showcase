import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminRosterConflictPage } from '@/lib/admin-roster-core';
import { RosterConflictList } from './roster-conflict-list';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async () => (key: string, values?: { value?: number }) =>
      key === 'nextPage' ? 'ดูรายการถัดไป' : `${key}${values?.value ?? ''}`,
  ),
}));

describe('RosterConflictList', () => {
  it('keeps conflict pagination inside the roster workspace', async () => {
    const batchId = '20000000-0000-4000-8000-000000000001';
    const page: AdminRosterConflictPage = {
      conflicts: [
        {
          batchId,
          conflictId: '20000000-0000-4000-8000-000000000002',
          existingFirstNameTh: 'ชื่อเดิม',
          existingLastNameTh: 'นามสกุลเดิม',
          incomingFirstNameTh: 'ชื่อใหม่',
          incomingLastNameTh: 'นามสกุลใหม่',
          reason: 'ตรวจสอบกับทะเบียนแล้ว',
          resolution: 'keep_existing',
          resolvedAt: '2026-08-30T12:00:00.000Z',
          rowNumber: 2,
          status: 'resolved',
          version: 2,
        },
      ],
      nextAfterRowNumber: 51,
    };

    render(await RosterConflictList({ action: vi.fn(), batchId, page }));

    expect(screen.getByRole('link', { name: 'ดูรายการถัดไป' }).getAttribute('href')).toBe(
      `/roster?batchId=${batchId}&conflictAfter=51`,
    );
  });
});
