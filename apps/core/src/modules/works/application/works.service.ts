import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { evaluateWorkDraft, type WorkDraftInput } from '../domain/work-draft-policy';
import {
  WORKS_CLOCK,
  WORKS_REPOSITORY,
  type WorkDraftView,
  type WorkListCursor,
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

interface CreateWorkInput extends WorkDraftInput {
  actorAccountId: string;
  idempotencyKey: string;
}

interface UpdateWorkDraftInput extends CreateWorkInput {
  expectedVersion: number;
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

const workListCursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

@Injectable()
export class WorksService {
  constructor(
    @Inject(WORKS_REPOSITORY) private readonly repository: WorksRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
  ) {}

  async createWork(input: CreateWorkInput): Promise<WorkMutationResult> {
    const context = await this.requireAuthoringContext(input.actorAccountId);
    const draft = this.requireValidDraft(input, context);
    return this.requireSuccessfulMutation(
      await this.repository.createWork({
        actorAccountId: input.actorAccountId,
        draft,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        submitterPersonId: context.personId,
      }),
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

  async listOwnedWorks(input: { accountId: string; cursor?: string; limit: number }) {
    const page = await this.repository.listOwnedWorks({
      accountId: input.accountId,
      cursor: this.decodeListCursor(input.cursor),
      limit: input.limit,
    });
    return {
      items: page.items.map((work) => ({ ...work, updatedAt: work.updatedAt.toISOString() })),
      nextCursor: page.nextCursor === null ? null : this.encodeListCursor(page.nextCursor),
    };
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

  private requireSuccessfulMutation(result: WorkMutationResult): WorkMutationResult {
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

  private encodeListCursor(cursor: WorkListCursor): string {
    return Buffer.from(JSON.stringify([cursor.updatedAt.toISOString(), cursor.publicId])).toString(
      'base64url',
    );
  }

  private decodeListCursor(cursor: string | undefined): WorkListCursor | null {
    if (cursor === undefined) return null;
    try {
      const [updatedAt, publicId] = workListCursorSchema.parse(
        JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
      );
      return { publicId, updatedAt: new Date(updatedAt) };
    } catch {
      throw new WorkError('INVALID_WORK_CURSOR', 422);
    }
  }
}
