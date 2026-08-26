export const CACHE_INVALIDATION_REPOSITORY = Symbol('CACHE_INVALIDATION_REPOSITORY');
export const PUBLIC_CACHE_INVALIDATOR = Symbol('PUBLIC_CACHE_INVALIDATOR');

export interface CacheInvalidationJob {
  attemptCount: number;
  eventId: number;
  occurredAt: Date;
  payload: unknown;
}

export interface CacheInvalidationRepository {
  claim(now: Date): Promise<CacheInvalidationJob | null>;
  complete(eventId: number, now: Date): Promise<void>;
  fail(eventId: number, nextAttemptAt: Date | null, errorCode: string, now: Date): Promise<void>;
}

export interface PublicCacheInvalidator {
  invalidate(tags: string[]): Promise<void>;
}
