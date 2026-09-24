import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  getAuthState: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: dependencies.redirect }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock('@/lib/instructor-auth-page-state', () => ({
  getInstructorAuthPageState: dependencies.getAuthState,
}));

import Home from './page';

describe('Instructor home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getAuthState.mockResolvedValue({
      kind: 'active',
      session: {
        accountId: 'account-1',
        instructorLogin: 'instructor',
      },
    });
  });

  it('redirects an active Instructor to the dashboard', async () => {
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect');

    expect(dependencies.redirect).toHaveBeenCalledWith('/dashboard');
  });
});
