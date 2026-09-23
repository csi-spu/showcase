import { describe, expect, it } from 'vitest';
import { notificationFeedSchema, notificationSchema } from './student-collection-forms-contract';

const NOTIFICATION = {
  createdAt: '2026-09-23T10:00:00.000Z',
  deadlineAt: '2026-09-30T17:00:00.000Z',
  formId: '58000000-0000-4000-8000-000000000001',
  formTitle: 'แบบฟอร์มรายงานตัว',
  groupId: '58000000-0000-4000-8000-000000000002',
  id: '58000000-0000-4000-8000-000000000003',
  isRead: false,
  kind: 'deadline_reminder',
};

describe('notification contract', () => {
  it('accepts a notification Core sends', () => {
    expect(notificationSchema.parse(NOTIFICATION)).toMatchObject({ kind: 'deadline_reminder' });
  });

  it('accepts a notification for a form with no deadline', () => {
    expect(
      notificationSchema.parse({ ...NOTIFICATION, deadlineAt: null, kind: 'obligation_assigned' }),
    ).toMatchObject({ deadlineAt: null });
  });

  /*
   * The whole reason the schema is strict: a field Core starts sending that the
   * client has not been taught about must fail here rather than reach a
   * browser that would render it unexamined.
   */
  it('rejects a field the contract does not declare', () => {
    expect(() =>
      notificationSchema.parse({
        ...NOTIFICATION,
        studentId: '6412345678',
      }),
    ).toThrow();
  });

  it('rejects a kind the client cannot render', () => {
    expect(() => notificationSchema.parse({ ...NOTIFICATION, kind: 'emailed' })).toThrow();
  });

  it('reads the unread count alongside the page', () => {
    expect(
      notificationFeedSchema.parse({ notifications: [NOTIFICATION], unreadCount: 4 }),
    ).toMatchObject({ unreadCount: 4 });
  });

  it('accepts an empty feed', () => {
    expect(notificationFeedSchema.parse({ notifications: [], unreadCount: 0 })).toMatchObject({
      notifications: [],
    });
  });

  it('rejects a feed missing its unread count', () => {
    expect(() => notificationFeedSchema.parse({ notifications: [] })).toThrow();
  });
});
