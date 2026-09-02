import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const changeRequestReasonSchema = z.enum([
  'content',
  'attribution',
  'media',
  'links_tags',
  'policy',
  'other',
]);
const academicPeriodSchema = z
  .object({ semester: z.enum(['1', '2', 'summer']), year: z.number().int() })
  .strict();
const categorySchema = z.enum(['course_work', 'competition_entry', 'academic_article']);
const queueItemSchema = z
  .object({
    academicPeriod: academicPeriodSchema,
    authorKind: z.enum(['student_submission', 'admin_correction']),
    category: categorySchema,
    number: z.number().int().positive(),
    revisionPublicId: z.uuid(),
    submittedAt: z.iso.datetime(),
    submitterAttributionName: z.string().min(1).max(100),
    title: z.string().min(1).max(150),
    workPublicId: z.uuid(),
  })
  .strict();
const reviewQueueSchema = z
  .object({ items: z.array(queueItemSchema).max(50), nextCursor: z.string().nullable() })
  .strict();
const workContentSchema = z
  .object({
    academicPeriod: academicPeriodSchema,
    category: categorySchema,
    description: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.url() }).strict()).max(5),
    summary: z.string(),
    tags: z
      .array(z.object({ displayLabel: z.string(), normalizedIdentity: z.string() }).strict())
      .max(5),
    title: z.string(),
    videoLinks: z
      .array(
        z
          .object({
            provider: z.enum(['youtube', 'tiktok']),
            providerVideoId: z.string(),
            url: z.url(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
const revisionSchema = z
  .object({
    authorKind: z.enum(['student_submission', 'admin_correction']),
    attributions: z.array(
      z
        .object({
          affiliation: z.string().nullable(),
          attributionName: z.string(),
          contributionRole: z.string().nullable(),
          kind: z.enum(['submitter', 'account', 'external']),
          studyYear: z.number().int().min(1).max(8).nullable(),
        })
        .strict(),
    ),
    content: workContentSchema,
    media: z.array(
      z
        .object({
          assetId: z.uuid(),
          dominantColor: z.string(),
          height: z.number().int().positive(),
          kind: z.enum(['poster', 'gallery']),
          position: z.number().int().min(1).max(3),
          preview: z.object({ expiresAt: z.iso.datetime(), url: z.url() }).strict(),
          variants: z.array(
            z
              .object({ height: z.number().int().positive(), width: z.number().int().positive() })
              .strict(),
          ),
          width: z.number().int().positive(),
        })
        .strict(),
    ),
    number: z.number().int().positive(),
    publicId: z.uuid(),
    status: z.enum(['approved', 'changes_requested', 'pending_review', 'withdrawn']),
    submittedAt: z.iso.datetime(),
    version: z.number().int().positive(),
    withdrawnAt: z.null(),
    workPublicId: z.uuid(),
  })
  .strict();
const changeRequestSchema = z
  .object({
    decision: z.literal('changes_requested'),
    feedback: z.string().min(10).max(2_000),
    publicId: z.uuid(),
    reason: changeRequestReasonSchema,
    revisionNumber: z.number().int().positive(),
    revisionPublicId: z.uuid(),
    reviewedAt: z.iso.datetime(),
    workPublicId: z.uuid(),
  })
  .strict();
const publicationSchema = z
  .object({
    publishedAt: z.iso.datetime(),
    revisionPublicId: z.uuid(),
    revisionVersion: z.number().int().positive(),
    workPublicId: z.uuid(),
  })
  .strict();
const publishedWorkSchema = z
  .object({
    academicPeriod: academicPeriodSchema,
    attributions: z.array(z.string().min(1).max(100)).max(21),
    category: categorySchema,
    poster: z
      .object({
        assetId: z.uuid(),
        dominantColor: z.string().regex(/^#[0-9A-F]{6}$/i),
        height: z.number().int().positive(),
        variants: z
          .array(
            z
              .object({ height: z.number().int().positive(), width: z.number().int().positive() })
              .strict(),
          )
          .min(1),
        width: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    publishedAt: z.iso.datetime(),
    summary: z.string().min(1).max(300),
    tags: z.array(z.object({ displayLabel: z.string(), publicId: z.uuid() }).strict()).max(5),
    title: z.string().min(1).max(150),
    workPublicId: z.uuid(),
  })
  .strict();
const publishedWorkPageSchema = z
  .object({
    hasNextPage: z.boolean(),
    items: z.array(publishedWorkSchema).max(48),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
const workRecoverySchema = z
  .object({
    activityState: z.enum(['active', 'archived']),
    publicationState: z.enum(['never_published', 'published', 'unpublished']),
    publicId: z.uuid(),
    publishedRevisionId: z.uuid().nullable(),
    publishedRevisionPublicId: z.uuid().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
const removalRequestSchema = z
  .object({
    createdAt: z.iso.datetime(),
    decisionReason: z.string().nullable(),
    publicId: z.uuid(),
    reason: z.string().min(10).max(1_000),
    revisionPublicId: z.uuid(),
    state: z.enum(['approved', 'cancelled', 'declined', 'pending']),
    title: z.string().min(1).max(150),
    version: z.number().int().positive(),
    workVersion: z.number().int().positive(),
    workPublicId: z.uuid(),
  })
  .strict();
const attributionRemovalRequestSchema = z
  .object({
    attributionName: z.string(),
    attributionPublicId: z.uuid(),
    correctionRevisionPublicId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    currentPublishedRevisionPublicId: z.uuid().nullable(),
    currentPublishedRevisionVersion: z.number().int().positive().nullable(),
    publicId: z.uuid(),
    reason: z.string().min(10).max(1_000),
    revisionPublicId: z.uuid(),
    state: z.enum(['accepted', 'declined', 'pending']),
    version: z.number().int().positive(),
    workPublicId: z.uuid(),
    workTitle: z.string(),
  })
  .strict();

export type AdminReviewQueue = z.infer<typeof reviewQueueSchema>;
export type AdminReviewQueueItem = z.infer<typeof queueItemSchema>;
export type AdminReviewRevision = z.infer<typeof revisionSchema>;
export type AdminCorrectionBase = AdminReviewRevision & { status: 'approved' };
export type ChangeRequestReason = z.infer<typeof changeRequestReasonSchema>;
export type AdminWorkRecovery = z.infer<typeof workRecoverySchema>;
export type AdminRemovalRequest = z.infer<typeof removalRequestSchema>;
export type AdminAttributionRemovalRequest = z.infer<typeof attributionRemovalRequestSchema>;
export type AdminPublishedWork = z.infer<typeof publishedWorkSchema>;

interface AdminReviewsCoreConfig {
  adminBffSecret: string;
  coreUrl: string;
}

export class AdminReviewsCoreClient {
  private readonly client: CoreClient;

  constructor(config: AdminReviewsCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-admin-bff-secret', value: config.adminBffSecret },
      fetchImpl,
    });
  }

  listQueue(
    sessionToken: string,
    input: { cursor?: string; limit: number },
  ): Promise<AdminReviewQueue> {
    const query = new URLSearchParams({ limit: String(input.limit) });
    if (input.cursor !== undefined) query.set('cursor', input.cursor);
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/review-queue?${query.toString()}`,
      responseSchema: reviewQueueSchema,
      sessionToken,
    });
  }

  listPublishedWorks(input: { cursor?: string; limit: number; q?: string }) {
    const query = new URLSearchParams({ limit: String(input.limit), sort: 'recent' });
    if (input.cursor !== undefined) query.set('cursor', input.cursor);
    if (input.q !== undefined) query.set('q', input.q);
    return this.client.request({
      method: 'GET',
      path: `/v1/public/works?${query.toString()}`,
      responseSchema: publishedWorkPageSchema,
    });
  }

  getRevision(sessionToken: string, revisionPublicId: string): Promise<AdminReviewRevision> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/revisions/${revisionPublicId}`,
      responseSchema: revisionSchema,
      sessionToken,
    });
  }

  async getCorrectionBase(
    sessionToken: string,
    workPublicId: string,
  ): Promise<AdminCorrectionBase> {
    const revision: AdminReviewRevision = await this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/works/${workPublicId}/correction-base`,
      responseSchema: revisionSchema,
      sessionToken,
    });
    if (revision.status !== 'approved') {
      throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503, undefined);
    }
    return { ...revision, status: 'approved' };
  }

  createCorrection(
    sessionToken: string,
    workPublicId: string,
    input: {
      academicPeriod: { semester: '1' | '2' | 'summer'; year: number };
      category: 'academic_article' | 'competition_entry' | 'course_work';
      description: string;
      expectedPublishedRevisionId: string;
      expectedRevisionVersion: number;
      idempotencyKey: string;
      links: Array<{ label: string; url: string }>;
      reason: string;
      summary: string;
      tags: string[];
      title: string;
      videoLinks: string[];
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/works/${workPublicId}/corrections`,
      responseSchema: z
        .object({ outcome: z.enum(['created', 'replayed']), revision: revisionSchema })
        .strict(),
      sessionToken,
    });
  }

  approveAndPublish(
    sessionToken: string,
    revisionPublicId: string,
    input: { expectedRevisionVersion: number; idempotencyKey: string },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/revisions/${revisionPublicId}/approve-and-publish`,
      responseSchema: z
        .object({
          outcome: z.enum(['published', 'replayed']),
          publication: publicationSchema,
        })
        .strict(),
      sessionToken,
      timeoutMilliseconds: 15_000,
    });
  }

  requestChanges(
    sessionToken: string,
    revisionPublicId: string,
    input: {
      expectedRevisionVersion: number;
      feedback: string;
      idempotencyKey: string;
      reason: ChangeRequestReason;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/revisions/${revisionPublicId}/change-request`,
      responseSchema: z
        .object({
          outcome: z.enum(['changed_requested', 'replayed']),
          review: changeRequestSchema,
        })
        .strict(),
      sessionToken,
      timeoutMilliseconds: 15_000,
    });
  }

  listRemovalRequests(sessionToken: string, limit: number) {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/removal-requests?limit=${limit}`,
      responseSchema: z.object({ items: z.array(removalRequestSchema).max(50) }).strict(),
      sessionToken,
    });
  }

  listAttributionRemovalRequests(sessionToken: string, input: { cursor?: string; limit: number }) {
    const query = new URLSearchParams({ limit: String(input.limit) });
    if (input.cursor !== undefined) query.set('cursor', input.cursor);
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/attribution-removal-requests?${query.toString()}`,
      responseSchema: z
        .object({
          items: z.array(attributionRemovalRequestSchema).max(50),
          nextCursor: z.string().nullable(),
        })
        .strict(),
      sessionToken,
    });
  }

  declineAttributionRemovalRequest(
    sessionToken: string,
    requestPublicId: string,
    input: {
      decisionReason: string;
      expectedRequestVersion: number;
      idempotencyKey: string;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/attribution-removal-requests/${requestPublicId}/decline`,
      responseSchema: z
        .object({
          outcome: z.enum(['replayed', 'resolved']),
          request: attributionRemovalRequestSchema,
        })
        .strict(),
      sessionToken,
    });
  }

  approveAndPublishAttributionRemoval(
    sessionToken: string,
    requestPublicId: string,
    input: {
      expectedPublishedRevisionPublicId: string;
      expectedPublishedRevisionVersion: number;
      expectedRequestVersion: number;
      idempotencyKey: string;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/attribution-removal-requests/${requestPublicId}/approve-and-publish-removal`,
      responseSchema: z
        .object({
          outcome: z.enum(['replayed', 'resolved']),
          request: attributionRemovalRequestSchema,
        })
        .strict(),
      sessionToken,
    });
  }

  getRecoveryState(sessionToken: string, workPublicId: string): Promise<AdminWorkRecovery> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/works/${workPublicId}/recovery-state`,
      responseSchema: workRecoverySchema,
      sessionToken,
    });
  }

  transitionWork(
    sessionToken: string,
    workPublicId: string,
    input: {
      expectedVersion: number;
      idempotencyKey: string;
      operation: 'archive' | 'restore_active' | 'restore_publication' | 'unpublish';
      reason: string;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/works/${workPublicId}/recovery`,
      responseSchema: z
        .object({ outcome: z.enum(['replayed', 'transitioned']), work: workRecoverySchema })
        .strict(),
      sessionToken,
    });
  }

  decideRemovalRequest(
    sessionToken: string,
    requestPublicId: string,
    input: {
      decision: 'approve' | 'decline';
      decisionReason?: string;
      expectedVersion: number;
      expectedWorkVersion: number;
      idempotencyKey: string;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/removal-requests/${requestPublicId}/decision`,
      responseSchema: z
        .object({
          outcome: z.enum(['replayed', 'resolved']),
          request: removalRequestSchema,
        })
        .strict(),
      sessionToken,
    });
  }
}

export { CoreClientError as AdminReviewsCoreError };
