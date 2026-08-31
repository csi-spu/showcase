import { afterEach, describe, expect, it, vi } from 'vitest';
import LegacyCorrectionsPage from './corrections/page';
import LegacyRecoveryQueuePage from './recovery/page';
import LegacyReviewQueuePage from './reviews/page';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((destination: string): never => {
    throw new Error(`redirect:${destination}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

describe('legacy Work Management routes', () => {
  afterEach(() => redirectMock.mockClear());

  it('preserves the Review cursor when moving to the canonical table', async () => {
    await expect(
      LegacyReviewQueuePage({ searchParams: Promise.resolve({ cursor: 'next/cursor' }) }),
    ).rejects.toThrow('redirect:/works?view=reviews&cursor=next%2Fcursor');
  });

  it('preserves the selected recovery queue and cursor', async () => {
    await expect(
      LegacyRecoveryQueuePage({
        searchParams: Promise.resolve({
          attributionCursor: 'next/cursor',
          view: 'attributions',
        }),
      }),
    ).rejects.toThrow('redirect:/works?view=attributions&cursor=next%2Fcursor');
  });

  it('keeps a direct recovery lookup on its focused detail route', async () => {
    const workPublicId = '79000000-0000-4000-8000-000000000001';
    await expect(
      LegacyRecoveryQueuePage({
        searchParams: Promise.resolve({ workPublicId }),
      }),
    ).rejects.toThrow(`redirect:/recovery/${workPublicId}`);
  });

  it('preserves Published Work search and pagination state', async () => {
    await expect(
      LegacyCorrectionsPage({
        searchParams: Promise.resolve({ cursor: 'next/cursor', q: 'ระบบ แนะนำ' }),
      }),
    ).rejects.toThrow(
      'redirect:/works?view=published&cursor=next%2Fcursor&q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A+%E0%B9%81%E0%B8%99%E0%B8%B0%E0%B8%99%E0%B8%B3',
    );
  });
});
