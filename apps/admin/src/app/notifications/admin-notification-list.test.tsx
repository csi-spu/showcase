import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notificationTypeSchema } from '@/lib/admin-notifications-core';
import { AdminNotificationList } from './admin-notification-list';

describe('AdminNotificationList', () => {
  afterEach(cleanup);

  it('opens an available Roster Batch in the dedicated roster workspace', () => {
    render(
      <AdminNotificationList
        items={[
          {
            createdAt: '2026-08-26T04:00:00.000Z',
            parameters: { createdCount: 10, failedCount: 1 },
            publicId: '11111111-1111-4111-8111-111111111111',
            readAt: null,
            target: {
              batchId: '22222222-2222-4222-8222-222222222222',
              kind: 'roster_batch',
            },
            targetAvailable: true,
            targetDestination: 'admin_roster',
            type: 'roster_batch_completed',
          },
        ]}
        labels={{
          markRead: 'ทำเครื่องหมายว่าอ่านแล้ว',
          open: 'เปิดรายการ',
          unavailable: 'รายการปลายทางไม่พร้อมใช้งาน',
          unread: 'ยังไม่ได้อ่าน',
        }}
        markReadAction={vi.fn()}
        messages={messages()}
      />,
    );

    expect(screen.getByRole('link', { name: 'เปิดรายการ' }).getAttribute('href')).toBe(
      '/roster?batchId=22222222-2222-4222-8222-222222222222',
    );
  });

  it('keeps an inaccessible target visible without rendering a capability link', () => {
    render(
      <AdminNotificationList
        items={[
          {
            createdAt: '2026-08-26T04:00:00.000Z',
            parameters: { createdCount: 10, failedCount: 1 },
            publicId: '11111111-1111-4111-8111-111111111111',
            readAt: '2026-08-26T05:00:00.000Z',
            target: {
              batchId: '22222222-2222-4222-8222-222222222222',
              kind: 'roster_batch',
            },
            targetAvailable: false,
            targetDestination: null,
            type: 'roster_batch_completed',
          },
        ]}
        labels={{
          markRead: 'ทำเครื่องหมายว่าอ่านแล้ว',
          open: 'เปิดรายการ',
          unavailable: 'รายการปลายทางไม่พร้อมใช้งาน',
          unread: 'ยังไม่ได้อ่าน',
        }}
        markReadAction={vi.fn()}
        messages={messages()}
      />,
    );

    expect(screen.getByText('ประมวลผลชุดนำเข้ารายชื่อแล้ว')).toBeTruthy();
    expect(screen.getByText('รายการปลายทางไม่พร้อมใช้งาน')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

function messages() {
  return Object.fromEntries(
    notificationTypeSchema.options.map((type) => [
      type,
      type === 'roster_batch_completed' ? 'ประมวลผลชุดนำเข้ารายชื่อแล้ว' : type,
    ]),
  ) as Record<(typeof notificationTypeSchema.options)[number], string>;
}
