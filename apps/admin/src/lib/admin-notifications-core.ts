import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

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
const targetSchema = z.discriminatedUnion('kind', [
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
const notificationSchema = z
  .object({
    createdAt: z.iso.datetime(),
    parameters: z.record(z.string(), z.union([z.string(), z.number()])),
    publicId: z.uuid(),
    readAt: z.iso.datetime().nullable(),
    target: targetSchema,
    targetDestination: z
      .enum(['admin_roster', 'public_work', 'student_home', 'student_invitations', 'student_work'])
      .nullable(),
    targetAvailable: z.boolean(),
    type: notificationTypeSchema,
  })
  .strict();
const pageSchema = z
  .object({ items: z.array(notificationSchema).max(50), nextCursor: z.string().nullable() })
  .strict();

export type AdminNotification = z.infer<typeof notificationSchema>;
export type AdminNotificationPage = z.infer<typeof pageSchema>;

export class AdminNotificationsCoreClient {
  private readonly client: CoreClient;

  constructor(
    config: { adminBffSecret: string; coreUrl: string },
    fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-admin-bff-secret', value: config.adminBffSecret },
      fetchImpl,
    });
  }

  list(
    sessionToken: string,
    input: { cursor?: string; limit: number; view: 'all' | 'unread' },
  ): Promise<AdminNotificationPage> {
    const query = new URLSearchParams({ limit: String(input.limit), view: input.view });
    if (input.cursor !== undefined) query.set('cursor', input.cursor);
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/notifications?${query.toString()}`,
      responseSchema: pageSchema,
      sessionToken,
    });
  }

  countUnread(sessionToken: string): Promise<{ count: number }> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/admin/notifications/unread-count',
      responseSchema: z.object({ count: z.number().int().nonnegative() }).strict(),
      sessionToken,
    });
  }

  markRead(sessionToken: string, publicId: string) {
    return this.client.request({
      method: 'POST',
      path: `/v1/internal/admin/notifications/${publicId}/read`,
      responseSchema: notificationSchema,
      sessionToken,
    });
  }

  markAllRead(sessionToken: string) {
    return this.client.request({
      method: 'POST',
      path: '/v1/internal/admin/notifications/read-all',
      responseSchema: z
        .object({ cutoff: z.iso.datetime(), updatedCount: z.number().int().nonnegative() })
        .strict(),
      sessionToken,
    });
  }
}

export { CoreClientError as AdminNotificationsCoreError };
