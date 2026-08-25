import { Inject, Injectable } from '@nestjs/common';
import { normalizeChangeRequest } from '../domain/review-decision-policy';
import { WORKS_CLOCK, type WorksClock } from './works.ports';
import { WORK_MEDIA_STORAGE, type WorkMediaStorage } from './work-media.ports';
import {
  REVIEWS_REPOSITORY,
  type ReviewFailureOutcome,
  type ReviewRepository,
  type ReviewResult,
} from './reviews.ports';

type ReviewErrorCode =
  | 'WORK_CHANGE_REQUEST_INVALID'
  | 'WORK_CHANGE_REQUEST_NOT_FOUND'
  | 'WORK_IDEMPOTENCY_CONFLICT'
  | 'WORK_MEDIA_SERVICE_UNAVAILABLE'
  | 'WORK_REVISION_NOT_FOUND'
  | 'WORK_REVISION_STATE_CONFLICT'
  | 'WORK_REVISION_VERSION_CONFLICT';

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ReviewError';
  }
}

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(REVIEWS_REPOSITORY) private readonly repository: ReviewRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
    @Inject(WORK_MEDIA_STORAGE) private readonly storage: WorkMediaStorage,
  ) {}

  async getRevisionMediaPreview(revisionPublicId: string, assetId: string) {
    const media = await this.repository.findRevisionMediaObject(revisionPublicId, assetId);
    if (media === null) throw new ReviewError('WORK_REVISION_NOT_FOUND', 404);
    try {
      return {
        assetId: media.assetId,
        expiresAt: new Date(this.clock.now().getTime() + 10 * 60 * 1_000).toISOString(),
        url: await this.storage.createPresignedGet({
          expiresInSeconds: 10 * 60,
          key: media.masterObjectKey,
        }),
      };
    } catch {
      throw new ReviewError('WORK_MEDIA_SERVICE_UNAVAILABLE', 503);
    }
  }

  async requestChanges(input: {
    actorAccountId: string;
    expectedRevisionVersion: number;
    feedback: string;
    idempotencyKey: string;
    reason: string;
    revisionPublicId: string;
  }): Promise<ReviewResult> {
    const changeRequest = normalizeChangeRequest(input);
    if (changeRequest === null) {
      throw new ReviewError('WORK_CHANGE_REQUEST_INVALID', 422);
    }
    return this.requireSuccess(
      await this.repository.requestChanges({
        actorAccountId: input.actorAccountId,
        expectedRevisionVersion: input.expectedRevisionVersion,
        feedback: changeRequest.feedback,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        reason: changeRequest.reason,
        revisionPublicId: input.revisionPublicId,
      }),
    );
  }

  async getLatestChangeRequest(actorAccountId: string, workPublicId: string) {
    const review = await this.repository.findLatestChangeRequestForSubmitter(
      actorAccountId,
      workPublicId,
    );
    if (review === null) throw new ReviewError('WORK_CHANGE_REQUEST_NOT_FOUND', 404);
    return review;
  }

  private requireSuccess(result: ReviewResult): ReviewResult {
    if ('review' in result) return result;
    const mapping: Record<ReviewFailureOutcome, [ReviewErrorCode, number]> = {
      idempotency_conflict: ['WORK_IDEMPOTENCY_CONFLICT', 409],
      revision_not_found: ['WORK_REVISION_NOT_FOUND', 404],
      revision_state_conflict: ['WORK_REVISION_STATE_CONFLICT', 409],
      revision_version_conflict: ['WORK_REVISION_VERSION_CONFLICT', 409],
    };
    const [code, status] = mapping[result.outcome];
    throw new ReviewError(code, status);
  }
}
