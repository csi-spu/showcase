import type {
  CacheInvalidationRepository,
  PublicCacheInvalidator,
} from './cache-invalidation.ports';
import { reportOperationalError } from '../../../observability/sentry';
import { CacheInvalidationService, cacheInvalidationTags } from './cache-invalidation.service';

jest.mock('../../../observability/sentry', () => ({ reportOperationalError: jest.fn() }));

const NOW = new Date('2026-08-26T08:00:00.000Z');

describe('CacheInvalidationService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('maps a Work event to bounded entity, collection, sitemap, and media tags', () => {
    expect(
      cacheInvalidationTags({
        cacheTargets: {
          mediaAssetIds: [id(3)],
          tagPublicIds: [id(2)],
          workPublicId: id(1),
        },
      }),
    ).toEqual([
      'showcase-catalog',
      'showcase-catalog-tags',
      'showcase-catalog-works',
      `showcase-media-${id(3)}`,
      'showcase-sitemap',
      `showcase-tag-${id(2)}`,
      `showcase-work-${id(1)}`,
    ]);
  });

  it('completes one claimed delivery after invalidating its tags', async () => {
    const repository = fakeRepository();
    repository.claim.mockResolvedValue({
      attemptCount: 1,
      eventId: 42,
      occurredAt: NOW,
      payload: { publicId: id(1) },
    });
    const invalidator = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const service = new CacheInvalidationService(repository, invalidator);

    await expect(service.processNext(NOW)).resolves.toBe(true);

    expect(invalidator.invalidate).toHaveBeenCalledWith([
      'showcase-catalog',
      'showcase-catalog-people',
      `showcase-profile-${id(1)}`,
      'showcase-sitemap',
    ]);
    expect(repository.complete.mock.calls).toContainEqual([42, expect.any(Date)]);
  });

  it('schedules bounded retry then makes the eighth failure terminal', async () => {
    const repository = fakeRepository();
    const invalidator: jest.Mocked<PublicCacheInvalidator> = {
      invalidate: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('failed'), { code: 'CDN_DOWN' })),
    };
    repository.claim.mockResolvedValue({
      attemptCount: 1,
      eventId: 42,
      occurredAt: NOW,
      payload: { publicId: id(1) },
    });
    const service = new CacheInvalidationService(repository, invalidator);
    await service.processNext(NOW);
    expect(reportOperationalError).not.toHaveBeenCalled();
    expect(repository.fail.mock.calls.at(-1)).toEqual([
      42,
      new Date('2026-08-26T08:00:05.000Z'),
      'CDN_DOWN',
      expect.any(Date),
    ]);

    repository.claim.mockResolvedValue({
      attemptCount: 8,
      eventId: 42,
      occurredAt: NOW,
      payload: { publicId: id(1) },
    });
    await service.processNext(NOW);
    expect(repository.fail.mock.calls.at(-1)).toEqual([42, null, 'CDN_DOWN', expect.any(Date)]);
    expect(reportOperationalError).toHaveBeenCalledWith(expect.any(Error), {
      errorCode: 'CACHE_INVALIDATION_TERMINAL_FAILURE',
      operation: 'public_cache_invalidation_failed',
      runtime: 'cache-worker',
    });
  });

  it('coalesces multiple deliveries into one provider purge', async () => {
    const repository = fakeRepository();
    repository.claim
      .mockResolvedValueOnce({
        attemptCount: 1,
        eventId: 1,
        occurredAt: NOW,
        payload: { publicId: id(1) },
      })
      .mockResolvedValueOnce({
        attemptCount: 1,
        eventId: 2,
        occurredAt: NOW,
        payload: { cacheTargets: { workPublicId: id(2) } },
      })
      .mockResolvedValueOnce(null);
    const invalidator = { invalidate: jest.fn().mockResolvedValue(undefined) };

    await new CacheInvalidationService(repository, invalidator).processBatch(NOW);

    expect(invalidator.invalidate).toHaveBeenCalledTimes(1);
    expect(repository.complete.mock.calls.map(([eventId]) => eventId)).toEqual([1, 2]);
  });
});

function fakeRepository(): jest.Mocked<CacheInvalidationRepository> {
  return {
    claim: jest.fn(),
    complete: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
}

function id(index: number): string {
  return `9c000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
