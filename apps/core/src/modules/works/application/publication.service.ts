import { Inject, Injectable } from '@nestjs/common';
import { WORKS_CLOCK, type WorksClock } from './works.ports';
import { WORK_MEDIA_STORAGE, type WorkMediaStorage } from './work-media.ports';
import {
  PUBLICATION_REPOSITORY,
  type PublicationFailureOutcome,
  type PublicationRepository,
  type PublicationResult,
} from './publication.ports';

type PublicationErrorCode =
  | 'PUBLIC_WORK_NOT_FOUND'
  | 'WORK_IDEMPOTENCY_CONFLICT'
  | 'WORK_PUBLICATION_STATE_CONFLICT'
  | 'WORK_MEDIA_SERVICE_UNAVAILABLE'
  | 'WORK_REVISION_NOT_FOUND'
  | 'WORK_REVISION_STATE_CONFLICT'
  | 'WORK_REVISION_VERSION_CONFLICT';

export class PublicationError extends Error {
  constructor(
    readonly code: PublicationErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'PublicationError';
  }
}

@Injectable()
export class PublicationService {
  constructor(
    @Inject(PUBLICATION_REPOSITORY) private readonly repository: PublicationRepository,
    @Inject(WORKS_CLOCK) private readonly clock: WorksClock,
    @Inject(WORK_MEDIA_STORAGE)
    private readonly mediaStorage: Pick<WorkMediaStorage, 'createPublicUrl'>,
  ) {}

  async approveAndPublish(input: {
    actorAccountId: string;
    expectedRevisionVersion: number;
    idempotencyKey: string;
    revisionPublicId: string;
  }): Promise<PublicationResult> {
    const result = await this.repository.approveAndPublish({ ...input, now: this.clock.now() });
    if ('publication' in result) return result;
    const mapping: Record<PublicationFailureOutcome, [PublicationErrorCode, number]> = {
      idempotency_conflict: ['WORK_IDEMPOTENCY_CONFLICT', 409],
      revision_not_found: ['WORK_REVISION_NOT_FOUND', 404],
      revision_state_conflict: ['WORK_REVISION_STATE_CONFLICT', 409],
      revision_version_conflict: ['WORK_REVISION_VERSION_CONFLICT', 409],
      work_state_conflict: ['WORK_PUBLICATION_STATE_CONFLICT', 409],
    };
    const [code, status] = mapping[result.outcome];
    throw new PublicationError(code, status);
  }

  async getPublicWork(workPublicId: string) {
    const work = await this.repository.findPublicWork(workPublicId);
    if (work === null) throw new PublicationError('PUBLIC_WORK_NOT_FOUND', 404);
    return work;
  }

  async getPublicMedia(workPublicId: string, assetId: string, width: number) {
    const objectKey = await this.repository.findPublicMediaObjectKey(workPublicId, assetId, width);
    if (objectKey === null) throw new PublicationError('PUBLIC_WORK_NOT_FOUND', 404);
    try {
      // The query above already constrains this to an approved Revision of a
      // published, active Work, so these bytes are public by definition. A
      // signature would only add a 60-second expiry that stops shared caches
      // from ever retaining the image.
      return { url: this.mediaStorage.createPublicUrl({ key: objectKey }) };
    } catch {
      throw new PublicationError('WORK_MEDIA_SERVICE_UNAVAILABLE', 503);
    }
  }
}
