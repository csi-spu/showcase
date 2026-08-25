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
    status: z.literal('pending_review'),
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

export type AdminReviewQueue = z.infer<typeof reviewQueueSchema>;
export type AdminReviewQueueItem = z.infer<typeof queueItemSchema>;
export type AdminReviewRevision = z.infer<typeof revisionSchema>;
export type ChangeRequestReason = z.infer<typeof changeRequestReasonSchema>;

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

  getRevision(sessionToken: string, revisionPublicId: string): Promise<AdminReviewRevision> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/revisions/${revisionPublicId}`,
      responseSchema: revisionSchema,
      sessionToken,
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
    });
  }
}

export { CoreClientError as AdminReviewsCoreError };
