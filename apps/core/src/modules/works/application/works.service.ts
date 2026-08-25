import { Inject, Injectable } from '@nestjs/common';
import { evaluateWorkDraft, type WorkDraftInput } from '../domain/work-draft-policy';
import {
  WORKS_CLOCK,
  WORKS_REPOSITORY,
  type WorkMutationResult,
  type WorksClock,
  type WorksRepository,
} from './works.ports';

type WorkErrorCode =
  | 'INVALID_WORK_DRAFT'
  | 'WORK_AUTHORING_FORBIDDEN'
  | 'WORK_IDEMPOTENCY_CONFLICT'
  | 'WORK_NOT_FOUND'
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

  async getAuthoringContext(accountId: string) {
    const context = await this.requireAuthoringContext(accountId);
    return {
      currentAcademicYear: context.currentAcademicYear,
      entryYear: context.entryYear,
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
    if (result.outcome === 'idempotency_conflict') {
      throw new WorkError('WORK_IDEMPOTENCY_CONFLICT', 409);
    }
    if (result.outcome === 'not_found') {
      throw new WorkError('WORK_NOT_FOUND', 404);
    }
    if (result.outcome === 'version_conflict') {
      throw new WorkError('WORK_VERSION_CONFLICT', 409);
    }
    return result;
  }
}
