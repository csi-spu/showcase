import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  listWorks: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: services.replace }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/student-auth-page-state', () => ({
  getStudentAuthPageState: vi.fn(async () => ({
    kind: 'active',
    session: { canUseStudentCapabilities: true },
  })),
}));

vi.mock('@/lib/student-auth-session', () => ({
  readStudentSessionToken: vi.fn(async () => 'session-token'),
}));

vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.example.test',
    studentBffSecret: 'student-bff-secret-with-at-least-32-characters',
    visitorUrl: 'https://visitor.example.test',
  }),
}));

vi.mock('@/lib/student-works-core', () => ({
  StudentWorksCoreClient: class {
    listWorks = services.listWorks;
  },
}));

vi.mock('../student-workspace-shell', () => ({
  StudentWorkspaceShell: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock('../workspace-page', () => ({
  WorkspacePage: ({ children }: PropsWithChildren) => <>{children}</>,
}));

import StudentWorksPage from './page';

describe('StudentWorksPage search', () => {
  beforeEach(() => {
    services.listWorks.mockResolvedValue({
      currentPage: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      items: [],
      nextCursor: null,
      pageSize: 12,
      previousCursor: null,
      totalItems: 0,
      totalPages: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the search input focused when refreshed results arrive', async () => {
    const view = render(
      await StudentWorksPage({
        searchParams: Promise.resolve({}),
      }),
    );
    const input = screen.getByRole('searchbox', { name: 'filters.search' });
    input.focus();
    fireEvent.change(input, { target: { value: 'เว็บ' } });

    view.rerender(
      await StudentWorksPage({
        searchParams: Promise.resolve({ query: 'เว็บ' }),
      }),
    );

    expect(screen.getByRole('searchbox', { name: 'filters.search' })).toBe(input);
    expect(document.activeElement).toBe(input);
  });
});
