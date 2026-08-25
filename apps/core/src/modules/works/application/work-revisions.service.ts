import { Inject, Injectable } from '@nestjs/common';
import { WORKS_CLOCK, type WorksClock } from './works.ports';
import {
  WORK_REVISIONS_REPOSITORY,
  type WorkRevisionFailureOutcome,
  type WorkRevisionRepository,
  type WorkRevisionResult,
} from './work-revisions.ports';
import { normalizeSubmitterAttribution } from '../domain/work-revision-policy';

type WorkRevisionErrorCode =
  | 'WORK_ATTRIBUTION_DUPLICATE'
  | 'WORK_ATTRIBUTION_LIMIT_EXCEEDED'
  | 'WORK_ATTRIBUTION_UNRESOLVED'
  | 'WORK_BASE_REVISION_CONFLICT'
  | 'WORK_IDEMPOTENCY_CONFLICT'
  | 'WORK_MEDIA_NOT_READY'
  | 'WORK_NOT_FOUND'
  | 'WORK_PENDING_REVISION_EXISTS'
  | 'WORK_POSTER_REQUIRED'
  | 'WORK_REVISION_NOT_FOUND'
  | 'WORK_REVISION_STATE_CONFLICT'
  | 'WORK_REVISION_VERSION_CONFLICT'
  | 'WORK_REVIEW_CURSOR_INVALID'
  | 'WORK_SUBMISSION_INCOMPLETE'
  | 'WORK_SUBMITTER_ATTRIBUTION_INVALID'
  | 'WORK_VERSION_CONFLICT';

export class WorkRevisionError extends Error {
  constructor(
    readonly code: WorkRevisionErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'WorkRevisionError';
  }
}

interface SubmitWorkRevisionInput {
  actorAccountId: string;
  attributionName: string;
  expectedBasePublishedRevisionId: string | null;
  expectedDraftVersion: number;
  idempotencyKey: string;
  studyYear: number;
  workPublicId: string;
}

interface WithdrawWorkRevisionInput {
  actorAccountId: string;
  expectedRevisionVersion: number;
  idempotencyKey: string;
  revisionPublicId: string;
  workPublicId: string;
}

@Injectable()
export class WorkRevisionsService {
  constructor(
    @Inject(WORK_REVISIONS_REPOSITORY) private readonly repository: WorkRevisionRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
  ) {}

  async submit(input: SubmitWorkRevisionInput): Promise<WorkRevisionResult> {
    const submitterAttribution = normalizeSubmitterAttribution({
      attributionName: input.attributionName,
      studyYear: input.studyYear,
    });
    if (submitterAttribution === null) {
      throw new WorkRevisionError('WORK_SUBMITTER_ATTRIBUTION_INVALID', 422);
    }
    return this.requireSuccess(
      await this.repository.submitRevision({
        actorAccountId: input.actorAccountId,
        expectedBasePublishedRevisionId: input.expectedBasePublishedRevisionId,
        expectedDraftVersion: input.expectedDraftVersion,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        submitterAttribution,
        workPublicId: input.workPublicId,
      }),
    );
  }

  async withdraw(input: WithdrawWorkRevisionInput): Promise<WorkRevisionResult> {
    return this.requireSuccess(
      await this.repository.withdrawRevision({ ...input, now: this.clock.now() }),
    );
  }

  async listReviewQueue(limit: number, cursor?: string) {
    const result = await this.repository.listReviewQueue({
      cursor,
      limit: Math.min(Math.max(limit, 1), 50),
    });
    if ('outcome' in result) {
      throw new WorkRevisionError('WORK_REVIEW_CURSOR_INVALID', 400);
    }
    return result;
  }

  async getRevisionForReview(revisionPublicId: string) {
    const revision = await this.repository.findRevisionForReview(revisionPublicId);
    if (revision === null) throw new WorkRevisionError('WORK_REVISION_NOT_FOUND', 404);
    return revision;
  }

  getPendingRevision(actorAccountId: string, workPublicId: string) {
    return this.repository.findPendingRevision(actorAccountId, workPublicId);
  }

  private requireSuccess(result: WorkRevisionResult): WorkRevisionResult {
    if ('revision' in result) return result;
    const mapping: Record<WorkRevisionFailureOutcome, [WorkRevisionErrorCode, number]> = {
      attribution_duplicate: ['WORK_ATTRIBUTION_DUPLICATE', 422],
      attribution_limit_exceeded: ['WORK_ATTRIBUTION_LIMIT_EXCEEDED', 422],
      attribution_unresolved: ['WORK_ATTRIBUTION_UNRESOLVED', 422],
      base_revision_conflict: ['WORK_BASE_REVISION_CONFLICT', 409],
      draft_version_conflict: ['WORK_VERSION_CONFLICT', 409],
      idempotency_conflict: ['WORK_IDEMPOTENCY_CONFLICT', 409],
      incomplete_content: ['WORK_SUBMISSION_INCOMPLETE', 422],
      invalid_submitter_attribution: ['WORK_SUBMITTER_ATTRIBUTION_INVALID', 422],
      invalid_transition: ['WORK_REVISION_STATE_CONFLICT', 409],
      media_not_ready: ['WORK_MEDIA_NOT_READY', 422],
      missing_poster: ['WORK_POSTER_REQUIRED', 422],
      not_found: ['WORK_NOT_FOUND', 404],
      pending_revision_exists: ['WORK_PENDING_REVISION_EXISTS', 409],
      revision_version_conflict: ['WORK_REVISION_VERSION_CONFLICT', 409],
    };
    const [code, status] = mapping[result.outcome];
    throw new WorkRevisionError(code, status);
  }
}
