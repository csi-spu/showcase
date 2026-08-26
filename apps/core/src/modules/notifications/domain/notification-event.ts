import { z } from 'zod';

export const notificationAudienceSchema = z.enum(['admin', 'student']);
export const notificationTypeSchema = z.enum([
  'admin_correction_created',
  'attribution_invitation_accepted',
  'attribution_invitation_expired',
  'attribution_invitation_received',
  'attribution_invitation_rejected',
  'attribution_invitation_revoked',
  'attribution_withdrawn',
  'removal_request_approved',
  'removal_request_declined',
  'roster_batch_completed',
  'student_access_extended',
  'work_archive',
  'work_change_requested',
  'work_published',
  'work_restore_active',
  'work_restore_publication',
  'work_unpublish',
]);

export const notificationParametersSchema = z
  .object({
    accessEndsAcademicYear: z.number().int().min(2400).max(2700).optional(),
    createdCount: z.number().int().nonnegative().max(10_000).optional(),
    failedCount: z.number().int().nonnegative().max(10_000).optional(),
    revisionNumber: z.number().int().positive().optional(),
    status: z.enum(['completed', 'completed_with_errors']).optional(),
    title: z.string().trim().min(1).max(150).optional(),
    unchangedCount: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict();

export const notificationTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('student_access') }).strict(),
  z.object({ batchId: z.uuid(), kind: z.literal('roster_batch') }).strict(),
  z
    .object({
      invitationPublicId: z.uuid().optional(),
      kind: z.literal('attribution_invitation'),
      workPublicId: z.uuid(),
    })
    .strict(),
  z.object({ kind: z.literal('work'), workPublicId: z.uuid() }).strict(),
]);

export type NotificationAudience = z.infer<typeof notificationAudienceSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;
export type NotificationParameters = z.infer<typeof notificationParametersSchema>;

export interface NotificationProjection {
  audience: NotificationAudience;
  createdAt: Date;
  eventId: number;
  parameters: NotificationParameters;
  recipientAccountId: string;
  target: NotificationTarget;
  type: NotificationType;
}

interface NotificationEvent {
  eventId: number;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
}

const rosterPayloadSchema = z
  .object({
    batchId: z.uuid(),
    createdCount: z.number().int().nonnegative().max(10_000),
    failedCount: z.number().int().nonnegative().max(10_000),
    status: z.enum(['completed', 'completed_with_errors']),
    unchangedCount: z.number().int().nonnegative().max(10_000),
    uploaderAccountId: z.uuid(),
  })
  .passthrough();

const accessPayloadSchema = z
  .object({
    accessEndsAcademicYear: z.number().int().min(2400).max(2700),
    studentAccountId: z.uuid(),
  })
  .passthrough();

const invitationPayloadSchema = z
  .object({
    invitationPublicId: z.uuid(),
    recipientAccountId: z.uuid(),
    workPublicId: z.uuid(),
  })
  .passthrough();

const standardPayloadSchema = z
  .object({
    audience: notificationAudienceSchema,
    parameters: notificationParametersSchema.default({}),
    recipientAccountId: z.uuid().optional(),
    recipientAccountIds: z.array(z.uuid()).max(21).optional(),
    target: notificationTargetSchema,
    type: notificationTypeSchema,
  })
  .passthrough()
  .refine(
    (value) => value.recipientAccountId !== undefined || value.recipientAccountIds !== undefined,
  );

const invitationTypeByEvent = {
  attribution_invitation_accepted: 'attribution_invitation_accepted',
  attribution_invitation_created: 'attribution_invitation_received',
  attribution_invitation_expired: 'attribution_invitation_expired',
  attribution_invitation_rejected: 'attribution_invitation_rejected',
  attribution_invitation_revoked: 'attribution_invitation_revoked',
  attribution_withdrawn: 'attribution_withdrawn',
} as const satisfies Readonly<Record<string, NotificationType>>;

const standardTypeByEvent = {
  admin_correction_created: 'admin_correction_created',
  removal_request_approved: 'removal_request_approved',
  removal_request_declined: 'removal_request_declined',
  work_archive: 'work_archive',
  work_restore_active: 'work_restore_active',
  work_restore_publication: 'work_restore_publication',
  work_revision_changes_requested: 'work_change_requested',
  work_revision_published: 'work_published',
  work_unpublish: 'work_unpublish',
} as const satisfies Readonly<Record<string, NotificationType>>;

export function projectNotificationEvent(event: NotificationEvent): NotificationProjection[] {
  if (event.eventType === 'roster_batch_completed') {
    const payload = rosterPayloadSchema.parse(event.payload);
    return [
      projection(
        event,
        payload.uploaderAccountId,
        'admin',
        'roster_batch_completed',
        {
          createdCount: payload.createdCount,
          failedCount: payload.failedCount,
          status: payload.status,
          unchangedCount: payload.unchangedCount,
        },
        { batchId: payload.batchId, kind: 'roster_batch' },
      ),
    ];
  }

  if (event.eventType === 'student_access_extended') {
    const payload = accessPayloadSchema.parse(event.payload);
    return [
      projection(
        event,
        payload.studentAccountId,
        'student',
        'student_access_extended',
        { accessEndsAcademicYear: payload.accessEndsAcademicYear },
        { kind: 'student_access' },
      ),
    ];
  }

  const invitationType =
    invitationTypeByEvent[event.eventType as keyof typeof invitationTypeByEvent];
  if (invitationType !== undefined) {
    const payload = invitationPayloadSchema.parse(event.payload);
    return [
      projection(
        event,
        payload.recipientAccountId,
        'student',
        invitationType,
        {},
        {
          invitationPublicId: payload.invitationPublicId,
          kind: 'attribution_invitation',
          workPublicId: payload.workPublicId,
        },
      ),
    ];
  }

  const payload = standardPayloadSchema.parse(event.payload);
  const expectedType = standardTypeByEvent[event.eventType as keyof typeof standardTypeByEvent];
  if (expectedType === undefined || payload.type !== expectedType) {
    throw new Error('NOTIFICATION_EVENT_TYPE_MISMATCH');
  }
  const recipients = new Set([
    ...(payload.recipientAccountIds ?? []),
    ...(payload.recipientAccountId === undefined ? [] : [payload.recipientAccountId]),
  ]);
  return [...recipients].sort().map((recipientAccountId) => ({
    audience: payload.audience,
    createdAt: event.occurredAt,
    eventId: event.eventId,
    parameters: payload.parameters,
    recipientAccountId,
    target: payload.target,
    type: payload.type,
  }));
}

function projection(
  event: NotificationEvent,
  recipientAccountId: string,
  audience: NotificationAudience,
  type: NotificationType,
  parameters: NotificationParameters,
  target: NotificationTarget,
): NotificationProjection {
  return {
    audience,
    createdAt: event.occurredAt,
    eventId: event.eventId,
    parameters,
    recipientAccountId,
    target,
    type,
  };
}
