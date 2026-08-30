import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';
import type { WorkMediaContentType, WorkMediaExtension } from './student-work-media';

const workCategorySchema = z.enum(['course_work', 'competition_entry', 'academic_article']);
const semesterSchema = z.enum(['1', '2', 'summer']);
const academicPeriodSchema = z
  .object({ semester: semesterSchema, year: z.number().int() })
  .strict();
const partialAcademicPeriodSchema = z
  .object({ semester: semesterSchema.nullable(), year: z.number().int().nullable() })
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
const partialWorkDraftContentSchema = z
  .object({
    academicPeriod: partialAcademicPeriodSchema,
    category: workCategorySchema.nullable(),
    description: z.string().nullable(),
    links: z.array(workLinkSchema).max(5),
    submitterStudyYear: z.number().int().min(1).max(4).nullable(),
    summary: z.string().nullable(),
    tags: z.array(normalizedTagSchema).max(5),
    title: z.string().nullable(),
    videoLinks: z.array(videoLinkSchema).max(3),
  })
  .strict();
const contributorSchema = z
  .object({
    attributionName: z.string(),
    contributionRole: z.string().nullable(),
    kind: z.enum(['account', 'external']),
    publicId: z.uuid(),
  })
  .strict();
const draftMediaSchema = z
  .object({
    assetId: z.uuid(),
    height: z.number().int().positive().nullable(),
    kind: z.enum(['gallery', 'poster']),
    position: z.number().int().min(1).max(3),
    rejectionCode: z.enum(['expired', 'invalid_media', 'processing_failed']).nullable(),
    status: z.enum(['pending_upload', 'uploaded', 'processing', 'ready', 'rejected']),
    width: z.number().int().positive().nullable(),
  })
  .strict();
const workDraftSchema = z
  .object({
    activityState: z.literal('active'),
    basePublishedRevisionId: z.uuid().nullable(),
    contributors: z.array(contributorSchema).max(20),
    draft: partialWorkDraftContentSchema,
    isComplete: z.boolean(),
    media: z.array(draftMediaSchema).max(4),
    publicationState: z.enum(['never_published', 'published', 'unpublished']),
    publishedRevisionId: z.uuid().nullable(),
    publicId: z.uuid(),
    savedAt: z.iso.datetime(),
    submitterAttributionName: z.string().nullable(),
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
const posterSchema = z
  .object({
    assetId: z.uuid(),
    height: z.number().int().positive(),
    variants: z.array(
      z
        .object({ height: z.number().int().positive(), width: z.number().int().positive() })
        .strict(),
    ),
    width: z.number().int().positive(),
  })
  .strict();
const workListItemSchema = z
  .object({
    activityState: z.enum(['active', 'archived']),
    academicPeriod: academicPeriodSchema.nullable(),
    category: workCategorySchema.nullable(),
    displayedSource: z.enum(['draft', 'pending_revision', 'published_revision', 'placeholder']),
    hasDraft: z.boolean(),
    isDraftComplete: z.boolean(),
    latestRevisionStatus: z
      .enum(['approved', 'changes_requested', 'pending_review', 'withdrawn'])
      .nullable(),
    poster: posterSchema.nullable(),
    primaryAction: z
      .enum(['continue_editing', 'return_to_editing', 'view_details', 'view_public_work'])
      .nullable(),
    publicationState: z.enum(['never_published', 'published', 'unpublished']),
    publicId: z.uuid(),
    secondaryActions: z.array(
      z.enum(['archive_saved_draft', 'create_new_revision', 'withdraw_submission']),
    ),
    summary: z.string().nullable(),
    title: z.string().nullable(),
    updatedAt: z.iso.datetime(),
    version: z.number().int().positive(),
  })
  .strict();
const workListPageSchema = z
  .object({
    currentPage: z.number().int().positive(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    items: z.array(workListItemSchema).max(12),
    nextCursor: z.string().nullable(),
    pageSize: z.literal(12),
    previousCursor: z.string().nullable(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
const workspaceSummarySchema = z
  .object({
    canMutate: z.boolean(),
    changeRequestCount: z.number().int().nonnegative(),
    draftCount: z.number().int().nonnegative(),
    latestActionableDraftPublicId: z.uuid().nullable(),
    pendingReviewCount: z.number().int().nonnegative(),
    publishedCount: z.number().int().nonnegative(),
    unreadNotificationCount: z.number().int().nonnegative(),
  })
  .strict();
const authoringContextSchema = z
  .object({ currentAcademicYear: z.number().int(), entryYear: z.number().int() })
  .strict();
const mutationResultSchema = z
  .object({ outcome: z.enum(['created', 'replayed', 'updated']), work: workDraftSchema })
  .strict();
const savedDraftMutationSchema = z
  .object({
    outcome: z.enum(['archived', 'replayed', 'restored']),
    work: z
      .object({
        activityState: z.enum(['active', 'archived']),
        publicationState: z.literal('never_published'),
        publicId: z.uuid(),
        version: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
const contributorMutationSchema = z
  .object({
    contributors: z.array(contributorSchema).max(20),
    outcome: z.enum(['added', 'removed', 'replayed']),
    version: z.number().int().positive(),
  })
  .strict();
const contributorCandidateSchema = z
  .object({
    candidateReference: z.uuid(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    publicProfile: z
      .object({
        entryYear: z.number().int().min(2400).max(9999),
        hasPhoto: z.boolean(),
        publicId: z.uuid(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const tagSuggestionSchema = z
  .object({
    activeWorkCount: z.number().int().positive(),
    displayLabel: z.string().min(1).max(50),
    publicId: z.uuid(),
  })
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
const workRevisionSchema = z
  .object({
    authorKind: z.enum(['admin_correction', 'student_submission']),
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
              .object({ height: z.number().int().positive(), width: z.number().int().positive() })
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
  .object({ outcome: z.enum(['created', 'replayed', 'withdrawn']), revision: workRevisionSchema })
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
const removalRequestMutationSchema = z
  .object({ outcome: z.enum(['created', 'replayed', 'resolved']), request: removalRequestSchema })
  .strict();

export type WorkDraft = z.infer<typeof workDraftSchema>;
export type WorkDraftContent = z.infer<typeof workDraftContentSchema>;
export type WorkDraftPatch = Partial<{
  academicPeriod: { semester: z.infer<typeof semesterSchema> | null; year: number | null } | null;
  category: z.infer<typeof workCategorySchema> | null;
  description: string | null;
  links: Array<z.infer<typeof workLinkSchema>>;
  submitterStudyYear: number | null;
  summary: string | null;
  tags: string[];
  title: string | null;
  videoLinks: string[];
}>;
export type WorkAuthoringState = z.infer<typeof workAuthoringStateSchema>;
export type WorkAuthoringContext = z.infer<typeof authoringContextSchema>;
export type WorkListItem = z.infer<typeof workListItemSchema>;
export type WorkListPage = z.infer<typeof workListPageSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkContributor = z.infer<typeof contributorSchema>;
export type ContributorCandidate = z.infer<typeof contributorCandidateSchema>;
export type WorkRevision = z.infer<typeof workRevisionSchema>;
export type WorkChangeRequest = z.infer<typeof changeRequestSchema>;
export type WorkRecovery = z.infer<typeof workRecoverySchema>;
export type RemovalRequest = z.infer<typeof removalRequestSchema>;
export type TagSuggestion = z.infer<typeof tagSuggestionSchema>;
export type WorkMediaKind = 'gallery' | 'poster';

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
    return this.get(
      '/v1/internal/student/works/authoring-context',
      authoringContextSchema,
      sessionToken,
    );
  }

  getWorkspaceSummary(sessionToken: string): Promise<WorkspaceSummary> {
    return this.get(
      '/v1/internal/student/works/workspace-summary',
      workspaceSummarySchema,
      sessionToken,
    );
  }

  listWorks(
    sessionToken: string,
    input: {
      category: 'academic_article' | 'all' | 'competition_entry' | 'course_work';
      cursor?: string;
      page: number;
      query: string;
      sort: 'updated_asc' | 'updated_desc';
      status: 'all' | 'changes_requested' | 'draft' | 'pending_review' | 'published';
      view: 'current' | 'saved';
    },
  ) {
    const query = new URLSearchParams({ view: input.view });
    if (input.query !== '') query.set('query', input.query);
    if (input.category !== 'all') query.set('category', input.category);
    if (input.status !== 'all') query.set('status', input.status);
    if (input.sort !== 'updated_desc') query.set('sort', input.sort);
    if (input.page > 1) query.set('page', String(input.page));
    if (input.cursor !== undefined) query.set('cursor', input.cursor);
    return this.get(
      `/v1/internal/student/works?${query.toString()}`,
      workListPageSchema,
      sessionToken,
    );
  }

  getWork(sessionToken: string, publicId: string): Promise<WorkDraft> {
    return this.get(`/v1/internal/student/works/${publicId}`, workDraftSchema, sessionToken);
  }

  getAuthoringState(sessionToken: string, publicId: string): Promise<WorkAuthoringState> {
    return this.get(
      `/v1/internal/student/works/${publicId}/authoring-state`,
      workAuthoringStateSchema,
      sessionToken,
    );
  }

  createWork(sessionToken: string, input: WorkDraftPatch & { idempotencyKey: string }) {
    return this.request(
      'POST',
      '/v1/internal/student/works',
      mutationResultSchema,
      sessionToken,
      input,
    );
  }

  patchWork(
    sessionToken: string,
    publicId: string,
    input: WorkDraftPatch & { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.request(
      'PATCH',
      `/v1/internal/student/works/${publicId}`,
      mutationResultSchema,
      sessionToken,
      input,
    );
  }

  seedPublishedDraft(
    sessionToken: string,
    publicId: string,
    input: { expectedPublishedRevisionId: string; idempotencyKey: string },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/draft`,
      mutationResultSchema,
      sessionToken,
      input,
    );
  }

  rebaseDraft(
    sessionToken: string,
    publicId: string,
    input: { expectedPublishedRevisionId: string; expectedVersion: number; idempotencyKey: string },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/draft/rebase`,
      mutationResultSchema,
      sessionToken,
      input,
    );
  }

  archiveSavedDraft(
    sessionToken: string,
    publicId: string,
    input: { confirmation: true; expectedVersion: number; idempotencyKey: string },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/archive-saved-draft`,
      savedDraftMutationSchema,
      sessionToken,
      input,
    );
  }

  restoreSavedDraft(
    sessionToken: string,
    publicId: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/restore-saved-draft`,
      savedDraftMutationSchema,
      sessionToken,
      input,
    );
  }

  searchContributorCandidates(sessionToken: string, publicId: string, query: string) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/contributor-candidates/search`,
      z.array(contributorCandidateSchema).max(8),
      sessionToken,
      { query },
    );
  }

  suggestTags(sessionToken: string, query: string): Promise<TagSuggestion[]> {
    const search = new URLSearchParams({ q: query });
    return this.get(
      `/v1/public/tags/suggestions?${search.toString()}`,
      z.array(tagSuggestionSchema).max(8),
      sessionToken,
    );
  }

  addAccountContributor(
    sessionToken: string,
    publicId: string,
    input: {
      candidateReference: string;
      contributionRole: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/contributors/account`,
      contributorMutationSchema,
      sessionToken,
      input,
    );
  }

  addExternalContributor(
    sessionToken: string,
    publicId: string,
    input: {
      attributionName: string;
      contributionRole: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/contributors/external`,
      contributorMutationSchema,
      sessionToken,
      input,
    );
  }

  removeContributor(
    sessionToken: string,
    publicId: string,
    contributorPublicId: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.request(
      'DELETE',
      `/v1/internal/student/works/${publicId}/contributors/${contributorPublicId}`,
      contributorMutationSchema,
      sessionToken,
      input,
    );
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
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/media-uploads`,
      mediaUploadSchema,
      sessionToken,
      input,
    );
  }

  finalizeMediaUpload(sessionToken: string, publicId: string, assetId: string) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/media-uploads/${assetId}/finalize`,
      z
        .object({
          assetId: z.uuid(),
          status: z.enum(['uploaded', 'processing', 'ready', 'rejected']),
        })
        .strict(),
      sessionToken,
    );
  }

  getMediaUploadStatus(sessionToken: string, publicId: string, assetId: string) {
    return this.get(
      `/v1/internal/student/works/${publicId}/media-uploads/${assetId}`,
      z
        .object({
          assetId: z.uuid(),
          preview: z
            .object({
              expiresAt: z.iso.datetime(),
              height: z.number().int().positive(),
              url: z.url(),
              width: z.number().int().positive(),
            })
            .strict()
            .nullable(),
          rejectionCode: z.enum(['expired', 'invalid_media', 'processing_failed']).nullable(),
          status: z.enum(['pending_upload', 'uploaded', 'processing', 'ready', 'rejected']),
          warnings: z.array(z.literal('poster_width_below_recommended')),
        })
        .strict(),
      sessionToken,
    );
  }

  getPrivateMediaVariant(sessionToken: string, publicId: string, assetId: string, width: number) {
    return this.get(
      `/v1/internal/student/works/${publicId}/media/${assetId}/variants/${width}`,
      z.object({ url: z.url() }).strict(),
      sessionToken,
    );
  }

  attachMedia(
    sessionToken: string,
    publicId: string,
    input: {
      assetId: string;
      expectedVersion: number;
      idempotencyKey: string;
      mediaKind: WorkMediaKind;
    },
  ) {
    return this.request(
      'PUT',
      `/v1/internal/student/works/${publicId}/media`,
      z.object({ outcome: z.literal('attached'), version: z.number().int().positive() }).strict(),
      sessionToken,
      input,
    );
  }

  submitRevision(
    sessionToken: string,
    publicId: string,
    input: {
      draft: WorkDraftContent;
      expectedBasePublishedRevisionId: string | null;
      expectedDraftVersion: number;
      idempotencyKey: string;
      studyYear: number;
    },
  ) {
    return this.client.request({
      body: {
        ...input.draft,
        expectedBasePublishedRevisionId: input.expectedBasePublishedRevisionId,
        expectedDraftVersion: input.expectedDraftVersion,
        idempotencyKey: input.idempotencyKey,
        studyYear: input.studyYear,
        tags: input.draft.tags.map((tag) => tag.displayLabel),
        videoLinks: input.draft.videoLinks.map((link) => link.url),
      },
      method: 'POST',
      path: `/v1/internal/student/works/${publicId}/revisions`,
      responseSchema: workRevisionMutationSchema,
      sessionToken,
      timeoutMilliseconds: 15_000,
    });
  }

  async getPendingRevision(sessionToken: string, publicId: string): Promise<WorkRevision | null> {
    const result = await this.get(
      `/v1/internal/student/works/${publicId}/revisions/pending`,
      z.object({ revision: workRevisionSchema.nullable() }).strict(),
      sessionToken,
    );
    return result.revision;
  }

  async getPublishedRevision(sessionToken: string, publicId: string): Promise<WorkRevision | null> {
    const result = await this.get(
      `/v1/internal/student/works/${publicId}/revisions/published`,
      z.object({ revision: workRevisionSchema.nullable() }).strict(),
      sessionToken,
    );
    return result.revision;
  }

  withdrawRevision(
    sessionToken: string,
    publicId: string,
    revisionPublicId: string,
    input: { expectedRevisionVersion: number; idempotencyKey: string },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/revisions/${revisionPublicId}/withdraw`,
      workRevisionMutationSchema,
      sessionToken,
      input,
    );
  }

  async getLatestChangeRequest(sessionToken: string, publicId: string): Promise<WorkChangeRequest> {
    const result = await this.get(
      `/v1/internal/student/works/${publicId}/change-request`,
      z.object({ review: changeRequestSchema }).strict(),
      sessionToken,
    );
    return result.review;
  }

  getRecoveryState(sessionToken: string, publicId: string): Promise<WorkRecovery> {
    return this.get(
      `/v1/internal/student/works/${publicId}/recovery-state`,
      workRecoverySchema,
      sessionToken,
    );
  }

  async getPendingRemovalRequest(
    sessionToken: string,
    publicId: string,
  ): Promise<RemovalRequest | null> {
    const result = await this.get(
      `/v1/internal/student/works/${publicId}/removal-request`,
      z.object({ request: removalRequestSchema.nullable() }).strict(),
      sessionToken,
    );
    return result.request;
  }

  createRemovalRequest(
    sessionToken: string,
    publicId: string,
    input: { expectedWorkVersion: number; idempotencyKey: string; reason: string },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/works/${publicId}/removal-requests`,
      removalRequestMutationSchema,
      sessionToken,
      input,
    );
  }

  cancelRemovalRequest(
    sessionToken: string,
    requestPublicId: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.request(
      'POST',
      `/v1/internal/student/removal-requests/${requestPublicId}/cancel`,
      removalRequestMutationSchema,
      sessionToken,
      input,
    );
  }

  private get<T>(
    path: `/${string}`,
    responseSchema: z.ZodType<T>,
    sessionToken: string,
  ): Promise<T> {
    return this.client.request({ method: 'GET', path, responseSchema, sessionToken });
  }

  private request<T>(
    method: 'DELETE' | 'PATCH' | 'POST' | 'PUT',
    path: `/${string}`,
    responseSchema: z.ZodType<T>,
    sessionToken: string,
    body?: unknown,
  ): Promise<T> {
    return this.client.request({ body, method, path, responseSchema, sessionToken });
  }
}

export { CoreClientError as StudentWorksCoreError };
