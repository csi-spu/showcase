import { describe, expect, it } from 'vitest';
import { exportJobSchema, exportListSchema } from './instructor-collection-forms-contract';

/*
 * The strict parse is load-bearing. A Core response field that is not declared
 * here is rejected at runtime and surfaces as a generic error, so these tests
 * pin the shape rather than trusting that the two sides stayed in step.
 */
const pending = {
  byteSize: null,
  errorCode: null,
  expiresAt: null,
  id: '58000000-0000-4000-8000-000000000001',
  kind: 'excel',
  readyAt: null,
  requestedAt: '2026-09-23T02:59:00.000Z',
  status: 'pending',
};

const ready = {
  ...pending,
  byteSize: 2_048,
  expiresAt: '2026-09-24T03:00:00.000Z',
  readyAt: '2026-09-23T03:00:00.000Z',
  status: 'ready',
};

describe('exportJobSchema', () => {
  /* A job is requested long before it has an artifact, so the absent half must parse. */
  it('accepts a job that has not been built yet', () => {
    expect(exportJobSchema.parse(pending)).toMatchObject({ byteSize: null, status: 'pending' });
  });

  it('accepts a ready job with its size and expiry', () => {
    expect(exportJobSchema.parse(ready)).toMatchObject({
      byteSize: 2_048,
      expiresAt: '2026-09-24T03:00:00.000Z',
      status: 'ready',
    });
  });

  it('accepts a failed job with the code that explains it', () => {
    expect(
      exportJobSchema.parse({
        ...pending,
        errorCode: 'COLLECTION_EXPORT_BUILD_FAILED',
        status: 'failed',
      }),
    ).toMatchObject({ errorCode: 'COLLECTION_EXPORT_BUILD_FAILED', status: 'failed' });
  });

  it('accepts every status Core can report', () => {
    for (const status of ['pending', 'building', 'ready', 'failed', 'expired']) {
      expect(exportJobSchema.parse({ ...pending, status })).toMatchObject({ status });
    }
  });

  it('accepts both artifact formats and rejects any other', () => {
    expect(exportJobSchema.parse({ ...pending, kind: 'zip' })).toMatchObject({ kind: 'zip' });
    expect(exportJobSchema.safeParse({ ...pending, kind: 'pdf' }).success).toBe(false);
  });

  it('rejects a status outside the lifecycle', () => {
    expect(exportJobSchema.safeParse({ ...pending, status: 'cancelled' }).success).toBe(false);
  });

  /*
   * Who requested an export is internal. If Core ever started sending it, the
   * strict parse must fail loudly rather than let it reach a rendered page.
   */
  it('rejects a response carrying the requesting account id', () => {
    expect(
      exportJobSchema.safeParse({
        ...ready,
        requestedByAccountId: '58000000-0000-4000-8000-000000000002',
      }).success,
    ).toBe(false);
  });

  it('rejects a job with no requested time', () => {
    expect(
      exportJobSchema.safeParse({
        byteSize: null,
        errorCode: null,
        expiresAt: null,
        id: pending.id,
        kind: pending.kind,
        readyAt: null,
        status: pending.status,
      }).success,
    ).toBe(false);
  });

  it('rejects a timestamp that is not ISO-8601', () => {
    expect(exportJobSchema.safeParse({ ...pending, requestedAt: '23/09/2026' }).success).toBe(
      false,
    );
  });
});

describe('exportListSchema', () => {
  it('accepts a history page', () => {
    expect(exportListSchema.parse({ exports: [ready, pending] }).exports).toHaveLength(2);
  });

  /* A group with no exports yet is an ordinary state, not a missing response. */
  it('accepts an empty history', () => {
    expect(exportListSchema.parse({ exports: [] }).exports).toEqual([]);
  });

  it('rejects an unexpected field beside the list', () => {
    expect(exportListSchema.safeParse({ exports: [], total: 0 }).success).toBe(false);
  });
});
