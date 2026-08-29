import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  headers: vi.fn(),
  request: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: dependencies.headers }));
vi.mock('@/lib/public-profile-core', () => ({
  getVisitorBffSecret: () => 'visitor-bff-secret-that-is-long-enough',
  getVisitorCoreUrl: () => 'https://core.example.test',
}));
vi.mock('@/lib/public-work-core', () => ({
  PublicAttributionRemovalError: class extends Error {
    constructor(readonly status: number) {
      super('PUBLIC_ATTRIBUTION_REMOVAL_FAILED');
    }
  },
  PublicWorkCoreClient: class {
    requestAttributionRemoval = dependencies.request;
  },
}));

import { requestAttributionRemovalAction } from './attribution-removal.actions';

const WORK_PUBLIC_ID = '76000000-0000-4000-8000-000000000001';
const ATTRIBUTION_PUBLIC_ID = '76000000-0000-4000-8000-000000000002';
const IDEMPOTENCY_KEY = '76000000-0000-4000-8000-000000000003';

describe('requestAttributionRemovalAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.request.mockResolvedValue({ received: true });
    dependencies.headers.mockResolvedValue(
      new Headers({
        host: 'visitor.example.test',
        origin: 'https://visitor.example.test',
        'x-forwarded-for': '203.0.113.42',
      }),
    );
  });

  it('forwards only an opaque source key through the authenticated Visitor BFF channel', async () => {
    const data = new FormData();
    data.set('idempotencyKey', IDEMPOTENCY_KEY);
    data.set('reason', 'เหตุผลที่ต้องการนำชื่อออกจากผลงาน');

    await expect(
      requestAttributionRemovalAction(
        WORK_PUBLIC_ID,
        ATTRIBUTION_PUBLIC_ID,
        { outcome: 'idle' },
        data,
      ),
    ).resolves.toEqual({ outcome: 'received' });

    expect(dependencies.request).toHaveBeenCalledWith(
      WORK_PUBLIC_ID,
      ATTRIBUTION_PUBLIC_ID,
      { idempotencyKey: IDEMPOTENCY_KEY, reason: 'เหตุผลที่ต้องการนำชื่อออกจากผลงาน' },
      {
        bffSecret: 'visitor-bff-secret-that-is-long-enough',
        sourceKey: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
    );
    expect(JSON.stringify(dependencies.request.mock.calls)).not.toContain('203.0.113.42');
  });

  it('ignores client-prepended forwarding values and binds the key to the trusted proxy hop', async () => {
    const data = new FormData();
    data.set('idempotencyKey', IDEMPOTENCY_KEY);
    data.set('reason', 'เหตุผลที่ต้องการนำชื่อออกจากผลงาน');

    dependencies.headers.mockResolvedValueOnce(
      new Headers({
        host: 'visitor.example.test',
        origin: 'https://visitor.example.test',
        'x-forwarded-for': '198.51.100.7, 203.0.113.42',
      }),
    );
    await requestAttributionRemovalAction(
      WORK_PUBLIC_ID,
      ATTRIBUTION_PUBLIC_ID,
      { outcome: 'idle' },
      data,
    );
    const firstKey = dependencies.request.mock.calls[0]?.[3]?.sourceKey;

    dependencies.headers.mockResolvedValueOnce(
      new Headers({
        host: 'visitor.example.test',
        origin: 'https://visitor.example.test',
        'x-forwarded-for': '192.0.2.99, 203.0.113.42',
      }),
    );
    await requestAttributionRemovalAction(
      WORK_PUBLIC_ID,
      ATTRIBUTION_PUBLIC_ID,
      { outcome: 'idle' },
      data,
    );

    expect(dependencies.request.mock.calls[1]?.[3]?.sourceKey).toBe(firstKey);
  });

  it('rejects a cross-origin submission before calling Core', async () => {
    dependencies.headers.mockResolvedValue(
      new Headers({ host: 'visitor.example.test', origin: 'https://attacker.example.test' }),
    );

    await expect(
      requestAttributionRemovalAction(
        WORK_PUBLIC_ID,
        ATTRIBUTION_PUBLIC_ID,
        { outcome: 'idle' },
        new FormData(),
      ),
    ).resolves.toEqual({ outcome: 'invalid' });
    expect(dependencies.request).not.toHaveBeenCalled();
  });
});
