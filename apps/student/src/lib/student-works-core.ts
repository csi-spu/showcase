import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';
import type { WorkMediaContentType, WorkMediaExtension } from './student-work-media';

const workCategorySchema = z.enum(['course_work', 'competition_entry', 'academic_article']);
const semesterSchema = z.enum(['1', '2', 'summer']);
const academicPeriodSchema = z
  .object({ semester: semesterSchema, year: z.number().int() })
  .strict();
const workLinkSchema = z.object({ label: z.string(), url: z.url() }).strict();
const normalizedTagSchema = z
  .object({ displayLabel: z.string(), normalizedIdentity: z.string() })
  .strict();
const videoLinkSchema = z
  .object({
    provider: z.enum(['youtube', 'tiktok']),
    providerVideoId: z.string(),
    url: z.url(),
  })
  .strict();
const workDraftContentSchema = z
  .object({
    academicPeriod: academicPeriodSchema,
    category: workCategorySchema,
    description: z.string(),
    links: z.array(workLinkSchema).max(5),
    summary: z.string(),
    tags: z.array(normalizedTagSchema).max(5),
    title: z.string(),
    videoLinks: z.array(videoLinkSchema).max(3),
  })
  .strict();
const workDraftSchema = z
  .object({
    activityState: z.literal('active'),
    basePublishedRevisionId: z.uuid().nullable(),
    draft: workDraftContentSchema,
    publicationState: z.enum(['never_published', 'published', 'unpublished']),
    publishedRevisionId: z.uuid().nullable(),
    publicId: z.uuid(),
    version: z.number().int().positive(),
  })
  .strict();
const workAuthoringStateSchema = z
  .object({
    activityState: z.literal('active'),
    draft: workDraftSchema.nullable(),
    publicationState: z.enum(['never_published', 'published', 'unpublished']),
    publishedRevisionId: z.uuid().nullable(),
    publicId: z.uuid(),
  })
  .strict();
const authoringContextSchema = z
  .object({ currentAcademicYear: z.number().int(), entryYear: z.number().int() })
  .strict();
const mutationResultSchema = z
  .object({ outcome: z.enum(['created', 'replayed', 'updated']), work: workDraftSchema })
  .strict();
const mediaUploadSchema = z
  .object({
    assetId: z.uuid(),
    expiresAt: z.iso.datetime(),
    headers: z
      .object({ 'content-type': z.enum(['image/jpeg', 'image/png', 'image/webp']) })
      .strict(),
    status: z.literal('pending_upload'),
    uploadUrl: z.url(),
  })
  .strict();
const attributionInvitationSchema = z
  .object({
    affiliation: z.string().nullable(),
    attributionName: z.string().nullable(),
    contributionRole: z.string().nullable(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    kind: z.enum(['account', 'external']),
    proposedAttributionName: z.string().nullable(),
    publicId: z.uuid(),
    state: z.enum(['pending', 'accepted', 'rejected', 'revoked', 'expired', 'withdrawn']),
    studyYear: z.number().int().min(1).max(8).nullable(),
    version: z.number().int().positive(),
  })
  .strict();
const attributionInvitationPageSchema = z
  .object({ items: z.array(attributionInvitationSchema), nextCursor: z.string().nullable() })
  .strict();
const invitationOutcomeSchema = z
  .object({
    outcome: z.enum(['accepted', 'received', 'rejected', 'replayed', 'revoked', 'withdrawn']),
  })
  .strict();
const workRevisionSchema = z
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
    content: workDraftContentSchema,
    media: z.array(
      z
        .object({
          assetId: z.uuid(),
          dominantColor: z.string().regex(/^#[0-9A-F]{6}$/u),
          height: z.number().int().positive().max(2_560),
          kind: z.enum(['poster', 'gallery']),
          position: z.number().int().min(1).max(3),
          variants: z.array(
            z
              .object({
                height: z.number().int().positive().max(2_560),
                width: z.number().int().positive().max(2_560),
              })
              .strict(),
          ),
          width: z.number().int().positive().max(2_560),
        })
        .strict(),
    ),
    number: z.number().int().positive(),
    publicId: z.uuid(),
    status: z.enum(['pending_review', 'changes_requested', 'approved', 'withdrawn']),
    submittedAt: z.iso.datetime(),
    version: z.number().int().positive(),
    withdrawnAt: z.iso.datetime().nullable(),
    workPublicId: z.uuid(),
  })
  .strict();
const workRevisionMutationSchema = z
  .object({
    outcome: z.enum(['created', 'replayed', 'withdrawn']),
    revision: workRevisionSchema,
  })
  .strict();
const changeRequestSchema = z
  .object({
    decision: z.literal('changes_requested'),
    feedback: z.string().min(10).max(2_000),
    publicId: z.uuid(),
    reason: z.enum(['content', 'attribution', 'media', 'links_tags', 'policy', 'other']),
    revisionNumber: z.number().int().positive(),
    revisionPublicId: z.uuid(),
    reviewedAt: z.iso.datetime(),
    workPublicId: z.uuid(),
  })
  .strict();

export type WorkDraft = z.infer<typeof workDraftSchema>;
export type WorkAuthoringState = z.infer<typeof workAuthoringStateSchema>;
export type WorkAuthoringContext = z.infer<typeof authoringContextSchema>;
export type WorkMutationInput = {
  academicPeriod: z.infer<typeof academicPeriodSchema>;
  category: z.infer<typeof workCategorySchema>;
  description: string;
  idempotencyKey: string;
  links: Array<z.infer<typeof workLinkSchema>>;
  summary: string;
  tags: string[];
  title: string;
  videoLinks: string[];
};
export type WorkUpdateInput = WorkMutationInput & { expectedVersion: number };
export type WorkMediaKind = 'gallery' | 'poster';
export type AttributionInvitation = z.infer<typeof attributionInvitationSchema>;
export type AttributionInvitationPage = z.infer<typeof attributionInvitationPageSchema>;
export type WorkRevision = z.infer<typeof workRevisionSchema>;
export type WorkChangeRequest = z.infer<typeof changeRequestSchema>;

interface StudentWorksCoreConfig {
  coreUrl: string;
  studentBffSecret: string;
}

export class StudentWorksCoreClient {
  private readonly client: CoreClient;

  constructor(config: StudentWorksCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-student-bff-secret', value: config.studentBffSecret },
      fetchImpl,
    });
  }

  getAuthoringContext(sessionToken: string): Promise<WorkAuthoringContext> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/student/works/authoring-context',
      responseSchema: authoringContextSchema,
      sessionToken,
    });
  }

  getWork(sessionToken: string, publicId: string): Promise<WorkDraft> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/student/works/${publicId}`,
      responseSchema: workDraftSchema,
      sessionToken,
    });
  }

  getAuthoringState(sessionToken: string, publicId: string): Promise<WorkAuthoringState> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/student/works/${publicId}/authoring-state`,
      responseSchema: workAuthoringStateSchema,
      sessionToken,
    });
  }

  seedPublishedDraft(
    sessionToken: string,
    publicId: string,
    input: { expectedPublishedRevisionId: string; idempotencyKey: string },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/draft`,
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  rebaseDraft(
    sessionToken: string,
    publicId: string,
    input: {
      expectedPublishedRevisionId: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/draft/rebase`,
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  createWork(sessionToken: string, input: WorkMutationInput) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/student/works',
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  updateWork(sessionToken: string, publicId: string, input: WorkUpdateInput) {
    return this.client.request({
      body: input,
      method: 'PUT',
      path: `/v1/internal/student/works/${publicId}`,
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  authorizeMediaUpload(
    sessionToken: string,
    publicId: string,
    input: {
      byteSize: number;
      contentType: WorkMediaContentType;
      fileExtension: WorkMediaExtension;
      idempotencyKey: string;
      mediaKind: WorkMediaKind;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/media-uploads`,
      responseSchema: mediaUploadSchema,
      sessionToken,
    });
  }

  finalizeMediaUpload(sessionToken: string, publicId: string, assetId: string) {
    return this.client.request({
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/media-uploads/${assetId}/finalize`,
      responseSchema: z
        .object({
          assetId: z.uuid(),
          status: z.enum(['uploaded', 'processing', 'ready', 'rejected']),
        })
        .strict(),
      sessionToken,
    });
  }

  getMediaUploadStatus(sessionToken: string, publicId: string, assetId: string) {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/student/works/${publicId}/media-uploads/${assetId}`,
      responseSchema: z
        .object({
          assetId: z.uuid(),
          preview: z
            .object({
              expiresAt: z.iso.datetime(),
              height: z.number().int().positive().max(2_560),
              url: z.url(),
              width: z.number().int().positive().max(2_560),
            })
            .strict()
            .nullable(),
          rejectionCode: z.enum(['expired', 'invalid_media', 'processing_failed']).nullable(),
          status: z.enum(['pending_upload', 'uploaded', 'processing', 'ready', 'rejected']),
          warnings: z.array(z.literal('poster_width_below_recommended')),
        })
        .strict(),
      sessionToken,
    });
  }

  attachMedia(
    sessionToken: string,
    publicId: string,
    input: { assetId: string; expectedVersion: number; mediaKind: WorkMediaKind },
  ) {
    return this.client.request({
      body: input,
      method: 'PUT',
      path: `/v1/internal/student/works/${publicId}/media`,
      responseSchema: z
        .object({ outcome: z.literal('attached'), version: z.number().int().positive() })
        .strict(),
      sessionToken,
    });
  }

  submitRevision(
    sessionToken: string,
    publicId: string,
    input: {
      attributionName: string;
      expectedBasePublishedRevisionId: string | null;
      expectedDraftVersion: number;
      idempotencyKey: string;
      studyYear: number;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/revisions`,
      responseSchema: workRevisionMutationSchema,
      sessionToken,
    });
  }

  async getPendingRevision(sessionToken: string, publicId: string): Promise<WorkRevision | null> {
    const result = await this.client.request({
      method: 'GET',
      path: `/v1/internal/student/works/${publicId}/revisions/pending`,
      responseSchema: z.object({ revision: workRevisionSchema.nullable() }).strict(),
      sessionToken,
    });
    return result.revision;
  }

  async getLatestChangeRequest(sessionToken: string, publicId: string): Promise<WorkChangeRequest> {
    const result = await this.client.request({
      method: 'GET',
      path: `/v1/internal/student/works/${publicId}/change-request`,
      responseSchema: z.object({ review: changeRequestSchema }).strict(),
      sessionToken,
    });
    return result.review;
  }

  withdrawRevision(
    sessionToken: string,
    publicId: string,
    revisionPublicId: string,
    input: { expectedRevisionVersion: number; idempotencyKey: string },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/revisions/${revisionPublicId}/withdraw`,
      responseSchema: workRevisionMutationSchema,
      sessionToken,
    });
  }

  listWorkInvitations(sessionToken: string, publicId: string) {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/student/works/${publicId}/contributor-invitations`,
      responseSchema: attributionInvitationPageSchema,
      sessionToken,
    });
  }

  listReceivedInvitations(sessionToken: string) {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/student/contributor-invitations',
      responseSchema: attributionInvitationPageSchema,
      sessionToken,
    });
  }

  createAccountInvitation(
    sessionToken: string,
    publicId: string,
    input: { idempotencyKey: string; studentId: string },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/contributor-invitations/account`,
      responseSchema: invitationOutcomeSchema,
      sessionToken,
    });
  }

  createExternalInvitation(
    sessionToken: string,
    publicId: string,
    input: {
      affiliation?: string;
      attributionName: string;
      contributionRole: string;
      idempotencyKey: string;
    },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/contributor-invitations/external`,
      responseSchema: z
        .object({
          invitation: attributionInvitationSchema,
          invitationToken: z.string().optional(),
          outcome: z.enum(['created', 'replayed']),
        })
        .strict(),
      sessionToken,
    });
  }

  transitionAccountInvitation(
    sessionToken: string,
    invitationPublicId: string,
    action: 'accept' | 'reject' | 'withdraw',
    input:
      | { expectedVersion: number; idempotencyKey: string }
      | {
          attributionName: string;
          consent: boolean;
          expectedVersion: number;
          idempotencyKey: string;
          studyYear: number;
        },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/contributor-invitations/${invitationPublicId}/${action}`,
      responseSchema: invitationOutcomeSchema,
      sessionToken,
    });
  }

  revokeInvitation(
    sessionToken: string,
    publicId: string,
    invitationPublicId: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/contributor-invitations/${invitationPublicId}/revoke`,
      responseSchema: invitationOutcomeSchema,
      sessionToken,
    });
  }

  exchangeExternalInvitation(token: string, studentSessionToken?: string) {
    return this.client.request({
      body: { token },
      method: 'POST',
      path: '/v1/internal/student/external-contributor-invitations/exchange',
      responseSchema: z
        .object({
          invitation: attributionInvitationSchema,
          invitationSessionToken: z.string(),
          sessionExpiresAt: z.iso.datetime(),
        })
        .strict(),
      ...(studentSessionToken === undefined ? {} : { sessionToken: studentSessionToken }),
    });
  }

  getExternalInvitation(invitationSessionToken: string) {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/student/external-contributor-invitations/current',
      responseSchema: attributionInvitationSchema,
      sessionToken: invitationSessionToken,
    });
  }

  transitionExternalInvitation(
    invitationSessionToken: string,
    action: 'accept' | 'reject',
    input:
      | { expectedVersion: number; idempotencyKey: string }
      | {
          affiliation?: string;
          attributionName: string;
          consent: boolean;
          contributionRole: string;
          expectedVersion: number;
          idempotencyKey: string;
        },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/student/external-contributor-invitations/${action}`,
      responseSchema: z
        .object({
          outcome: z.enum(['accepted', 'rejected', 'replayed']),
          recoveryCode: z.string().optional(),
        })
        .strict(),
      sessionToken: invitationSessionToken,
    });
  }
}

export { CoreClientError as StudentWorksCoreError };
