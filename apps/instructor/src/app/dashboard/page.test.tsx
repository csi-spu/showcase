import type { PropsWithChildren } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  getFilterOptions: vi.fn(),
  getOverview: vi.fn(),
  getStudentAttention: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock('@/lib/instructor-auth-page-state', () => ({
  getInstructorAuthPageState: vi.fn(async () => ({
    kind: 'active',
    session: { accountId: 'instructor-account' },
  })),
}));
vi.mock('@/lib/instructor-auth-session', () => ({
  readInstructorSessionToken: vi.fn(async () => 'session-token'),
}));
vi.mock('@/lib/instructor-collection-overview-core', () => ({
  InstructorCollectionOverviewCoreClient: class {
    getFilterOptions = services.getFilterOptions;
    getOverview = services.getOverview;
    getStudentAttention = services.getStudentAttention;
  },
}));
vi.mock('@/lib/server-environment', () => ({
  getInstructorServerEnvironment: vi.fn(() => ({})),
}));
vi.mock('../app-shell', () => ({
  AppShell: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('./scope-filters', () => ({
  ScopeFilters: ({ label }: { label: string }) => <div aria-label={label} role="group" />,
}));

import DashboardPage from './page';

describe('Instructor dashboard layout', () => {
  beforeEach(() => {
    services.getFilterOptions.mockResolvedValue({ entryYears: [], groups: [], rounds: [] });
    services.getOverview.mockResolvedValue({
      activeFormProgress: [
        {
          completedStudents: 0,
          deadlineAt: null,
          formId: 'form-1',
          formTitle: 'เอกสารฝึกงาน',
          groupId: 'group-1',
          groupName: 'CS67-1',
          roundId: 'round-1',
          roundName: 'ชุดงานฝึกงาน',
          totalStudents: 28,
        },
      ],
      activeRoundTotals: {
        groups: 1,
        students: 28,
        studentsFullyComplete: 0,
        studentsPartiallyComplete: 0,
        studentsWithNoSubmission: 28,
        studentsWithObligations: 28,
        submissionsPendingReview: 0,
      },
      needsAttention: [],
      roundCounts: { active: 1, closed: 0 },
      upcomingDeadlines: [],
    });
    services.getStudentAttention.mockResolvedValue({ nextCursor: null, rows: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps zero-response progress content full width inside stable panels', async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    const progressPanel = screen.getByRole('heading', { name: 'progressTitle' }).closest('section');
    const upcomingPanel = screen.getByRole('heading', { name: 'upcomingTitle' }).closest('section');

    expect(progressPanel).not.toBeNull();
    expect(progressPanel?.className).toContain('min-h-48');
    expect(upcomingPanel?.className).toContain('min-h-48');

    const progressList = within(progressPanel as HTMLElement).getByRole('list');
    expect(progressList.className).toContain('flex-col');
    expect(progressList.className).not.toContain('xl:grid-cols-3');
    expect(within(progressPanel as HTMLElement).getByText('0%')).toBeTruthy();
  });
});
