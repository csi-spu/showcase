import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  CACHE_INVALIDATION_REPOSITORY,
  PUBLIC_CACHE_INVALIDATOR,
  type CacheInvalidationRepository,
  type PublicCacheInvalidator,
} from './cache-invalidation.ports';

const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_SECONDS = [5, 15, 30, 60, 120, 300, 300] as const;
const targetsSchema = z
  .object({
    mediaAssetIds: z.array(z.uuid()).max(4).optional(),
    tagPublicIds: z.array(z.uuid()).max(10).optional(),
    workPublicId: z.uuid().optional(),
  })
  .strict();
const payloadSchema = z
  .object({
    cacheTargets: targetsSchema.optional(),
    publicId: z.uuid().optional(),
  })
  .passthrough()
  .refine((payload) => payload.cacheTargets !== undefined || payload.publicId !== undefined);

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(
    @Inject(CACHE_INVALIDATION_REPOSITORY)
    private readonly repository: CacheInvalidationRepository,
    @Inject(PUBLIC_CACHE_INVALIDATOR)
    private readonly invalidator: PublicCacheInvalidator,
  ) {}

  async processNext(now = new Date()): Promise<boolean> {
    return this.processBatch(now, 1);
  }

  async processBatch(now = new Date(), maximumJobs = 4): Promise<boolean> {
    const jobs = [];
    while (jobs.length < maximumJobs) {
      const job = await this.repository.claim(now);
      if (job === null) break;
      jobs.push(job);
    }
    if (jobs.length === 0) return false;
    try {
      const tags = [...new Set(jobs.flatMap((job) => cacheInvalidationTags(job.payload)))].sort();
      if (tags.length > 100) throw new Error('CACHE_INVALIDATION_TAG_LIMIT');
      await this.invalidator.invalidate(tags);
      const completedAt = new Date();
      await Promise.all(jobs.map((job) => this.repository.complete(job.eventId, completedAt)));
      this.logger.log({
        eventCount: jobs.length,
        eventIds: jobs.map((job) => job.eventId),
        oldestLagMilliseconds: Math.max(
          0,
          Date.now() - Math.min(...jobs.map((job) => job.occurredAt.getTime())),
        ),
        operation: 'public_cache_invalidation_completed',
      });
    } catch (error: unknown) {
      const failedAt = new Date();
      await Promise.all(
        jobs.map((job) =>
          this.repository.fail(
            job.eventId,
            retryAt(now, job.attemptCount),
            cacheInvalidationErrorCode(error),
            failedAt,
          ),
        ),
      );
      this.logger.warn({
        errorCode: cacheInvalidationErrorCode(error),
        eventCount: jobs.length,
        eventIds: jobs.map((job) => job.eventId),
        terminalEventIds: jobs
          .filter((job) => retryAt(now, job.attemptCount) === null)
          .map((job) => job.eventId),
        operation: 'public_cache_invalidation_failed',
      });
    }
    return true;
  }
}

export function cacheInvalidationTags(payload: unknown): string[] {
  const parsed = payloadSchema.parse(payload);
  const tags = new Set(['showcase-catalog', 'showcase-sitemap']);
  if (parsed.publicId !== undefined) {
    tags.add('showcase-catalog-people');
    tags.add(`showcase-profile-${parsed.publicId}`);
  }
  if (parsed.cacheTargets !== undefined) {
    tags.add('showcase-catalog-works');
    tags.add('showcase-catalog-tags');
    const { mediaAssetIds = [], tagPublicIds = [], workPublicId } = parsed.cacheTargets;
    if (workPublicId !== undefined) tags.add(`showcase-work-${workPublicId}`);
    for (const publicId of tagPublicIds) tags.add(`showcase-tag-${publicId}`);
    for (const assetId of mediaAssetIds) tags.add(`showcase-media-${assetId}`);
  }
  return [...tags].sort();
}

function retryAt(now: Date, attemptCount: number): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_SECONDS[Math.max(0, attemptCount - 1)] ?? 300;
  return new Date(now.getTime() + delay * 1_000);
}

function cacheInvalidationErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.slice(0, 100);
  }
  return error instanceof z.ZodError
    ? 'CACHE_INVALIDATION_PAYLOAD_INVALID'
    : 'CACHE_INVALIDATION_PROVIDER_FAILED';
}
