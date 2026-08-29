import { projectNotificationEvent } from './notification-event';

describe('projectNotificationEvent', () => {
  it('projects one safe student Notification for an access extension', () => {
    expect(
      projectNotificationEvent({
        eventId: 41,
        eventType: 'student_access_extended',
        occurredAt: new Date('2026-08-26T04:00:00.000Z'),
        payload: {
          accessEndsAcademicYear: 2575,
          studentAccountId: '11111111-1111-4111-8111-111111111111',
        },
      }),
    ).toEqual([
      {
        audience: 'student',
        createdAt: new Date('2026-08-26T04:00:00.000Z'),
        eventId: 41,
        parameters: { accessEndsAcademicYear: 2575 },
        recipientAccountId: '11111111-1111-4111-8111-111111111111',
        target: { kind: 'student_access' },
        type: 'student_access_extended',
      },
    ]);
  });

  it('deduplicates recipients in a publication event', () => {
    expect(
      projectNotificationEvent({
        eventId: 42,
        eventType: 'work_revision_published',
        occurredAt: new Date('2026-08-26T04:00:00.000Z'),
        payload: {
          audience: 'student',
          parameters: { revisionNumber: 2, title: 'ระบบจัดแสดงผลงาน' },
          recipientAccountIds: [
            '11111111-1111-4111-8111-111111111111',
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
          target: {
            kind: 'work',
            workPublicId: '33333333-3333-4333-8333-333333333333',
          },
          type: 'work_published',
        },
      }),
    ).toHaveLength(2);
  });

  it('rejects arbitrary target URLs from an outbox payload', () => {
    expect(() =>
      projectNotificationEvent({
        eventId: 43,
        eventType: 'work_revision_published',
        occurredAt: new Date('2026-08-26T04:00:00.000Z'),
        payload: {
          audience: 'student',
          parameters: { title: 'ระบบจัดแสดงผลงาน' },
          recipientAccountIds: ['11111111-1111-4111-8111-111111111111'],
          target: { kind: 'url', url: 'https://example.com/credential' },
          type: 'work_published',
        },
      }),
    ).toThrow();
  });

  it.each([
    ['admin_correction_created', 'admin_correction_created'],
    ['removal_request_approved', 'removal_request_approved'],
    ['removal_request_declined', 'removal_request_declined'],
    ['work_archive', 'work_archive'],
    ['work_attribution_removed', 'work_attribution_removed'],
    ['work_restore_active', 'work_restore_active'],
    ['work_restore_publication', 'work_restore_publication'],
    ['work_revision_changes_requested', 'work_change_requested'],
    ['work_revision_published', 'work_published'],
    ['work_unpublish', 'work_unpublish'],
  ] as const)('maps %s only to its stable Notification type', (eventType, type) => {
    const projected = projectNotificationEvent({
      eventId: 50,
      eventType,
      occurredAt: new Date('2026-08-26T04:00:00.000Z'),
      payload: {
        audience: 'student',
        parameters: { title: 'ระบบจัดแสดงผลงาน' },
        recipientAccountIds: ['11111111-1111-4111-8111-111111111111'],
        target: { kind: 'work', workPublicId: '33333333-3333-4333-8333-333333333333' },
        type,
      },
    });
    expect(projected[0]?.type).toBe(type);
  });

  it('rejects an event payload that attempts to substitute another stable type', () => {
    expect(() =>
      projectNotificationEvent({
        eventId: 51,
        eventType: 'work_revision_changes_requested',
        occurredAt: new Date('2026-08-26T04:00:00.000Z'),
        payload: {
          audience: 'student',
          parameters: {},
          recipientAccountIds: ['11111111-1111-4111-8111-111111111111'],
          target: { kind: 'work', workPublicId: '33333333-3333-4333-8333-333333333333' },
          type: 'work_published',
        },
      }),
    ).toThrow('NOTIFICATION_EVENT_TYPE_MISMATCH');
  });

  it.each([
    ['attribution_invitation_created', 'attribution_invitation_received'],
    ['attribution_invitation_revoked', 'attribution_invitation_revoked'],
    ['attribution_invitation_accepted', 'attribution_invitation_accepted'],
    ['attribution_invitation_rejected', 'attribution_invitation_rejected'],
    ['attribution_invitation_expired', 'attribution_invitation_expired'],
    ['attribution_withdrawn', 'attribution_withdrawn'],
  ] as const)('maps %s to the specified invitation recipient type', (eventType, type) => {
    expect(
      projectNotificationEvent({
        eventId: 52,
        eventType,
        occurredAt: new Date('2026-08-26T04:00:00.000Z'),
        payload: {
          invitationPublicId: '22222222-2222-4222-8222-222222222222',
          recipientAccountId: '11111111-1111-4111-8111-111111111111',
          workPublicId: '33333333-3333-4333-8333-333333333333',
        },
      })[0]?.type,
    ).toBe(type);
  });
});
