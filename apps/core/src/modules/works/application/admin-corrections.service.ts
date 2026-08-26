import { Inject, Injectable } from '@nestjs/common';
import { evaluateAdminCorrection } from '../domain/admin-correction-policy';
import type { WorkDraftInput } from '../domain/work-draft-policy';
import {
  ADMIN_CORRECTIONS_REPOSITORY,
  type AdminCorrectionFailureOutcome,
  type AdminCorrectionResult,
  type AdminCorrectionsRepository,
} from './admin-corrections.ports';
import { WORKS_CLOCK, type WorksClock } from './works.ports';

type AdminCorrectionErrorCode =
  | 'WORK_ADMIN_CORRECTION_INVALID'
  | 'WORK_ADMIN_CORRECTION_STATE_CONFLICT'
  | 'WORK_BASE_REVISION_CONFLICT'
  | 'WORK_IDEMPOTENCY_CONFLICT'
  | 'WORK_NOT_FOUND'
  | 'WORK_PENDING_REVISION_EXISTS'
  | 'WORK_REVISION_VERSION_CONFLICT';

export class AdminCorrectionError extends Error {
  constructor(
    readonly code: AdminCorrectionErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'AdminCorrectionError';
  }
}

@Injectable()
export class AdminCorrectionsService {
  constructor(
    @Inject(ADMIN_CORRECTIONS_REPOSITORY) private readonly repository: AdminCorrectionsRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
  ) {}

  async create(
    input: WorkDraftInput & {
      actorAccountId: string;
      expectedPublishedRevisionId: string;
      expectedRevisionVersion: number;
      idempotencyKey: string;
      reason: string;
      workPublicId: string;
    },
  ): Promise<AdminCorrectionResult> {
    const context = await this.repository.findCorrectionContext(input.workPublicId);
    if (context === null) throw new AdminCorrectionError('WORK_NOT_FOUND', 404);
    const evaluation = evaluateAdminCorrection(
      input,
      context.publishedRevision.content,
      input.reason,
      context.academicRange,
    );
    if (!evaluation.isValid) {
      throw new AdminCorrectionError('WORK_ADMIN_CORRECTION_INVALID', 422);
    }
    const result = await this.repository.createCorrection({
      actorAccountId: input.actorAccountId,
      candidate: evaluation.candidate,
      diff: evaluation.diff,
      expectedPublishedRevisionId: input.expectedPublishedRevisionId,
      expectedRevisionVersion: input.expectedRevisionVersion,
      idempotencyKey: input.idempotencyKey,
      now: this.clock.now(),
      reason: evaluation.reason,
      workPublicId: input.workPublicId,
    });
    if ('revision' in result) return result;
    const mapping: Record<AdminCorrectionFailureOutcome, [AdminCorrectionErrorCode, number]> = {
      base_revision_conflict: ['WORK_BASE_REVISION_CONFLICT', 409],
      idempotency_conflict: ['WORK_IDEMPOTENCY_CONFLICT', 409],
      not_found: ['WORK_NOT_FOUND', 404],
      pending_revision_exists: ['WORK_PENDING_REVISION_EXISTS', 409],
      revision_version_conflict: ['WORK_REVISION_VERSION_CONFLICT', 409],
      work_state_conflict: ['WORK_ADMIN_CORRECTION_STATE_CONFLICT', 409],
    };
    const [code, status] = mapping[result.outcome];
    throw new AdminCorrectionError(code, status);
  }

  async getBase(workPublicId: string) {
    const context = await this.repository.findCorrectionContext(workPublicId);
    if (context === null) throw new AdminCorrectionError('WORK_NOT_FOUND', 404);
    return context.publishedRevision;
  }
}
