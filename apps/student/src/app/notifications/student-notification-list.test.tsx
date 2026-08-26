import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { notificationTypeSchema } from '@/lib/student-notifications-core';
import { StudentNotificationList } from './student-notification-list';

describe('StudentNotificationList', () => {
  it('shows unread state, safe message, and an authorized internal Work target', () => {
    render(
      <StudentNotificationList
        items={[
          {
            createdAt: '2026-08-26T04:00:00.000Z',
            parameters: { title: 'ระบบจัดแสดงผลงาน' },
            publicId: '11111111-1111-4111-8111-111111111111',
            readAt: null,
            target: {
              kind: 'work',
              workPublicId: '22222222-2222-4222-8222-222222222222',
            },
            targetAvailable: true,
            targetDestination: 'student_work',
            type: 'work_published',
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
        visitorUrl="https://showcase.example.test"
      />,
    );

    expect(screen.getByText('ผลงานได้รับการเผยแพร่แล้ว')).toBeTruthy();
    expect(screen.getByText('ยังไม่ได้อ่าน')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'เปิดรายการ' }).getAttribute('href')).toBe(
      '/works/22222222-2222-4222-8222-222222222222',
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'ทำเครื่องหมายว่าอ่านแล้ว' }).disabled,
    ).toBe(false);
  });
});

function messages() {
  return Object.fromEntries(
    notificationTypeSchema.options.map((type) => [
      type,
      type === 'work_published' ? 'ผลงานได้รับการเผยแพร่แล้ว' : type,
    ]),
  ) as Record<(typeof notificationTypeSchema.options)[number], string>;
}
