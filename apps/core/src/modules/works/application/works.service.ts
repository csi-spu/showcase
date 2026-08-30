import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  evaluateWorkDraft,
  normalizeWorkDraftPatch,
  type NormalizedWorkDraftPatch,
  type WorkDraftInput,
  type WorkDraftPatchInput,
} from '../domain/work-draft-policy';
import {
  WorkWorkspaceCursorCodec,
  WorkWorkspaceCursorError,
} from '../domain/work-workspace-cursor';
import {
  WORKS_CLOCK,
  WORKS_CURSOR_CODEC,
  WORKS_REPOSITORY,
  type WorkDraftView,
  type WorkListCursor,
  type WorkManagementCategory,
  type WorkManagementSort,
  type WorkManagementStatus,
  type WorkMutationResult,
  type WorksClock,
  type WorksRepository,
} from './works.ports';

type WorkErrorCode =
  | 'INVALID_WORK_DRAFT'
  | 'INVALID_WORK_CURSOR'
  | 'WORK_AUTHORING_FORBIDDEN'
  | 'WORK_BASE_REVISION_CONFLICT'
  | 'WORK_DRAFT_EXISTS'
  | 'WORK_IDEMPOTENCY_CONFLICT'
  | 'WORK_NOT_FOUND'
  | 'WORK_NOT_PUBLISHED'
  | 'WORK_PENDING_REVISION_EXISTS'
  | 'WORK_SAVED_DRAFT_CONFIRMATION_REQUIRED'
  | 'WORK_SAVED_DRAFT_STATE_CONFLICT'
  | 'WORK_VERSION_CONFLICT';

export class WorkError extends Error {
  constructor(
    readonly code: WorkErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'WorkError';
  }
}

interface CreateWorkInput extends WorkDraftPatchInput {
  actorAccountId: string;
  idempotencyKey: string;
}

interface PatchWorkDraftInput extends CreateWorkInput {
  expectedVersion: number;
  publicId: string;
}

interface UpdateWorkDraftInput extends WorkDraftInput {
  actorAccountId: string;
  expectedVersion: number;
  idempotencyKey: string;
  publicId: string;
}

interface SeedPublishedDraftInput {
  actorAccountId: string;
  expectedPublishedRevisionId: string;
  idempotencyKey: string;
  publicId: string;
}

interface RebaseDraftInput extends SeedPublishedDraftInput {
  expectedVersion: number;
}

interface ListOwnedWorksInput {
  accountId: string;
  category?: WorkManagementCategory;
  cursor?: string;
  page?: number;
  query?: string;
  sort?: WorkManagementSort;
  status?: WorkManagementStatus;
  view: 'current' | 'saved';
}

@Injectable()
export class WorksService {
  private readonly logger = new Logger(WorksService.name);

  constructor(
    @Inject(WORKS_REPOSITORY) private readonly repository: WorksRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
    @Inject(WORKS_CURSOR_CODEC) private readonly cursorCodec: WorkWorkspaceCursorCodec,
  ) {}

  async createWork(input: CreateWorkInput): Promise<WorkMutationResult> {
    const context = await this.requireAuthoringContext(input.actorAccountId);
    const patch = this.requireValidPatch(input, context);
    if (!this.hasMeaningfulChange(patch)) {
      throw new WorkError('INVALID_WORK_DRAFT', 422);
    }
    const result = this.requireSuccessfulMutation(
      await this.repository.createWork({
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        patch,
        submitterPersonId: context.personId,
      }),
    );
    this.logger.log({
      actorAccountId: input.actorAccountId,
      operation: 'work_autosave_created',
      outcome: result.outcome,
      workPublicId: result.work.publicId,
    });
    return result;
  }

  async archiveSavedDraft(input: {
    actorAccountId: string;
    confirmation: boolean;
    expectedVersion: number;
    idempotencyKey: string;
    publicId: string;
  }) {
    if (!input.confirmation) {
      throw new WorkError('WORK_SAVED_DRAFT_CONFIRMATION_REQUIRED', 422);
    }
    await this.requireAuthoringContext(input.actorAccountId);
    return this.requireSavedDraftSuccess(
      await this.repository.archiveSavedDraft({
        actorAccountId: input.actorAccountId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        publicId: input.publicId,
      }),
    );
  }

  async restoreSavedDraft(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    publicId: string;
  }) {
    await this.requireAuthoringContext(input.actorAccountId);
    return this.requireSavedDraftSuccess(
      await this.repository.restoreSavedDraft({ ...input, now: this.clock.now() }),
    );
  }

  async getDraft(accountId: string, publicId: string) {
    const draft = await this.repository.findOwnedDraft(accountId, publicId);
    if (draft === null) {
      throw new WorkError('WORK_NOT_FOUND', 404);
    }
    return draft;
  }

  async getAuthoringState(accountId: string, publicId: string) {
    const state = await this.repository.findOwnedWorkState(accountId, publicId);
    if (state === null) throw new WorkError('WORK_NOT_FOUND', 404);
    return state;
  }

  async getAuthoringContext(accountId: string) {
    const context = await this.requireAuthoringContext(accountId);
    return {
      currentAcademicYear: context.currentAcademicYear,
      entryYear: context.entryYear,
    };
  }

  async getWorkspaceSummary(accountId: string) {
    const summary = await this.repository.getWorkspaceSummary(accountId);
    if (summary === null) throw new WorkError('WORK_NOT_FOUND', 404);
    return summary;
  }

  async listOwnedWorks(input: ListOwnedWorksInput) {
    const category = input.category ?? 'all';
    const query = input.query?.trim() ?? '';
    const pageNumber = input.cursor === undefined ? (input.page ?? 1) : 1;
    const sort = input.sort ?? 'updated_desc';
    const status = input.status ?? 'all';
    const state = {
      accountId: input.accountId,
      category,
      pageSize: 12,
      query,
      sort,
      status,
      view: input.view,
    };
    const page = await this.repository.listOwnedWorks({
      accountId: input.accountId,
      category,
      cursor: this.decodeListCursor(state, input.cursor),
      limit: 12,
      page: pageNumber,
      query,
      sort,
      status,
      view: input.view,
    });
    return {
      currentPage: page.currentPage,
      hasNextPage: page.hasNextPage,
      hasPreviousPage: page.hasPreviousPage,
      items: page.items.map((work) => ({ ...work, updatedAt: work.updatedAt.toISOString() })),
      nextCursor: page.nextCursor === null ? null : this.encodeListCursor(state, page.nextCursor),
      pageSize: page.pageSize,
      previousCursor:
        page.previousCursor === null ? null : this.encodeListCursor(state, page.previousCursor),
      totalItems: page.totalItems,
      totalPages: page.totalPages,
    };
  }

  async patchDraft(input: PatchWorkDraftInput): Promise<WorkMutationResult> {
    const context = await this.requireAuthoringContext(input.actorAccountId);
    const patch = this.requireValidPatch(input, context);
    const result = this.requireSuccessfulMutation(
      await this.repository.patchDraft({
        actorAccountId: input.actorAccountId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        patch,
        publicId: input.publicId,
      }),
    );
    this.logger.log({
      actorAccountId: input.actorAccountId,
      operation: 'work_autosave_updated',
      outcome: result.outcome,
      workPublicId: input.publicId,
    });
    return result;
  }

  async updateDraft(input: UpdateWorkDraftInput): Promise<WorkMutationResult> {
    const context = await this.requireAuthoringContext(input.actorAccountId);
    const draft = this.requireValidDraft(input, context);
    return this.requireSuccessfulMutation(
      await this.repository.updateDraft({
        actorAccountId: input.actorAccountId,
        draft,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        publicId: input.publicId,
      }),
    );
  }

  async seedPublishedDraft(input: SeedPublishedDraftInput): Promise<WorkMutationResult> {
    await this.requireAuthoringContext(input.actorAccountId);
    return this.requireSuccessfulMutation(
      await this.repository.seedDraft({ ...input, now: this.clock.now() }),
    );
  }

  async rebaseDraft(input: RebaseDraftInput): Promise<WorkMutationResult> {
    await this.requireAuthoringContext(input.actorAccountId);
    return this.requireSuccessfulMutation(
      await this.repository.rebaseDraft({ ...input, now: this.clock.now() }),
    );
  }

  private async requireAuthoringContext(accountId: string) {
    const context = await this.repository.findAuthoringContext(accountId);
    if (context === null || context.currentAcademicYear === null) {
      throw new WorkError('WORK_AUTHORING_FORBIDDEN', 403);
    }
    return { ...context, currentAcademicYear: context.currentAcademicYear };
  }

  private requireValidDraft(
    input: WorkDraftInput,
    context: { currentAcademicYear: number; entryYear: number },
  ) {
    const evaluation = evaluateWorkDraft(input, context);
    if (!evaluation.isValid) {
      throw new WorkError('INVALID_WORK_DRAFT', 422);
    }
    return evaluation.draft;
  }

  private requireSuccessfulMutation(
    result: WorkMutationResult,
  ): Extract<WorkMutationResult, { work: WorkDraftView }> {
    if ('work' in result) return result;
    const mapping: Record<
      Exclude<WorkMutationResult, { work: WorkDraftView }>['outcome'],
      [WorkErrorCode, number]
    > = {
      draft_exists: ['WORK_DRAFT_EXISTS', 409],
      idempotency_conflict: ['WORK_IDEMPOTENCY_CONFLICT', 409],
      not_found: ['WORK_NOT_FOUND', 404],
      pending_revision_exists: ['WORK_PENDING_REVISION_EXISTS', 409],
      published_revision_conflict: ['WORK_BASE_REVISION_CONFLICT', 409],
      version_conflict: ['WORK_VERSION_CONFLICT', 409],
      work_not_published: ['WORK_NOT_PUBLISHED', 409],
    };
    const [code, status] = mapping[result.outcome];
    throw new WorkError(code, status);
  }

  private requireSavedDraftSuccess(
    result: Awaited<ReturnType<WorksRepository['archiveSavedDraft']>>,
  ) {
    if ('work' in result) return result;
    const mapping = {
      idempotency_conflict: ['WORK_IDEMPOTENCY_CONFLICT', 409],
      not_found: ['WORK_NOT_FOUND', 404],
      state_conflict: ['WORK_SAVED_DRAFT_STATE_CONFLICT', 409],
      version_conflict: ['WORK_VERSION_CONFLICT', 409],
    } as const;
    const [code, status] = mapping[result.outcome];
    throw new WorkError(code, status);
  }

  private requireValidPatch(
    input: WorkDraftPatchInput,
    context: { currentAcademicYear: number; entryYear: number },
  ) {
    const evaluation = normalizeWorkDraftPatch(input, context);
    if (!evaluation.isValid) throw new WorkError('INVALID_WORK_DRAFT', 422);
    return evaluation.patch;
  }

  private hasMeaningfulChange(patch: NormalizedWorkDraftPatch): boolean {
    return (
      (patch.title !== undefined && patch.title !== null) ||
      (patch.summary !== undefined && patch.summary !== null) ||
      (patch.description !== undefined && patch.description !== null) ||
      (patch.category !== undefined && patch.category !== null) ||
      (patch.submitterStudyYear !== undefined && patch.submitterStudyYear !== null) ||
      (patch.academicPeriod !== undefined &&
        (patch.academicPeriod.semester !== null || patch.academicPeriod.year !== null)) ||
      (patch.links?.length ?? 0) > 0 ||
      (patch.tags?.length ?? 0) > 0 ||
      (patch.videoLinks?.length ?? 0) > 0
    );
  }

  private encodeListCursor(
    state: Parameters<WorkWorkspaceCursorCodec['encode']>[0],
    cursor: WorkListCursor,
  ): string {
    return this.cursorCodec.encode(state, {
      direction: cursor.direction,
      publicId: cursor.publicId,
      updatedAt: cursor.updatedAt.toISOString(),
    });
  }

  private decodeListCursor(
    state: Parameters<WorkWorkspaceCursorCodec['decode']>[0],
    cursor: string | undefined,
  ): WorkListCursor | null {
    if (cursor === undefined) return null;
    try {
      const decoded = this.cursorCodec.decode(state, cursor);
      return { ...decoded, updatedAt: new Date(decoded.updatedAt) };
    } catch (error: unknown) {
      if (!(error instanceof WorkWorkspaceCursorError)) throw error;
      throw new WorkError('INVALID_WORK_CURSOR', 422);
    }
  }
}
