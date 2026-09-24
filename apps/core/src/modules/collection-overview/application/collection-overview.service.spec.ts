import { encodeAttentionCursor } from './collection-attention-cursor';
import {
  CollectionOverviewError,
  type CollectionFilterOptions,
  type CollectionOverview,
  type CollectionOverviewQuery,
  type CollectionOverviewRepository,
  type CollectionStudentAttentionPage,
  type CollectionStudentAttentionQuery,
} from './collection-overview.ports';
import {
  CollectionOverviewService,
  DEFAULT_OVERVIEW_ATTENTION_LIMIT,
  DEFAULT_OVERVIEW_PROGRESS_LIMIT,
  DEFAULT_OVERVIEW_UPCOMING_LIMIT,
  DEFAULT_STUDENT_ATTENTION_LIMIT,
  MAX_OVERVIEW_ATTENTION_LIMIT,
  MAX_OVERVIEW_PROGRESS_LIMIT,
  MAX_OVERVIEW_UPCOMING_LIMIT,
  MAX_STUDENT_ATTENTION_LIMIT,
} from './collection-overview.service';

const OVERVIEW: CollectionOverview = {
  activeFormProgress: [],
  activeRoundTotals: {
    groups: 2,
    students: 30,
    studentsFullyComplete: 18,
    studentsPartiallyComplete: 6,
    studentsWithNoSubmission: 4,
    studentsWithObligations: 28,
    submissionsPendingReview: 7,
  },
  needsAttention: [],
  roundCounts: { active: 1, closed: 3 },
  upcomingDeadlines: [],
};

const ATTENTION_PAGE: CollectionStudentAttentionPage = { nextCursor: null, rows: [] };

const FILTERS: CollectionFilterOptions = { entryYears: [2566], groups: [], rounds: [] };

class FakeCollectionOverviewRepository implements CollectionOverviewRepository {
  attentionQueries: CollectionStudentAttentionQuery[] = [];
  overviewQueries: CollectionOverviewQuery[] = [];

  getFilterOptions(): Promise<CollectionFilterOptions> {
    return Promise.resolve(FILTERS);
  }

  getOverview(query: CollectionOverviewQuery): Promise<CollectionOverview> {
    this.overviewQueries.push(query);
    return Promise.resolve(OVERVIEW);
  }

  getStudentAttention(
    query: CollectionStudentAttentionQuery,
  ): Promise<CollectionStudentAttentionPage> {
    this.attentionQueries.push(query);
    return Promise.resolve(ATTENTION_PAGE);
  }
}

describe('CollectionOverviewService', () => {
  it('uses small defaults for the landing page and an unscoped active-round view', async () => {
    const repository = new FakeCollectionOverviewRepository();
    const service = new CollectionOverviewService(repository);

    await expect(service.getOverview()).resolves.toEqual(OVERVIEW);
    expect(repository.overviewQueries).toEqual([
      {
        attentionLimit: DEFAULT_OVERVIEW_ATTENTION_LIMIT,
        progressLimit: DEFAULT_OVERVIEW_PROGRESS_LIMIT,
        scope: { entryYear: null, groupId: null, roundId: null },
        upcomingLimit: DEFAULT_OVERVIEW_UPCOMING_LIMIT,
      },
    ]);
  });

  it('caps every list even when called outside the validated HTTP boundary', async () => {
    const repository = new FakeCollectionOverviewRepository();
    const service = new CollectionOverviewService(repository);

    await service.getOverview({
      attentionLimit: MAX_OVERVIEW_ATTENTION_LIMIT + 100,
      progressLimit: MAX_OVERVIEW_PROGRESS_LIMIT + 100,
      upcomingLimit: MAX_OVERVIEW_UPCOMING_LIMIT + 100,
    });

    expect(repository.overviewQueries[0]).toMatchObject({
      attentionLimit: MAX_OVERVIEW_ATTENTION_LIMIT,
      progressLimit: MAX_OVERVIEW_PROGRESS_LIMIT,
      upcomingLimit: MAX_OVERVIEW_UPCOMING_LIMIT,
    });
  });

  it('raises a non-positive or fractional limit to a usable page', async () => {
    const repository = new FakeCollectionOverviewRepository();
    const service = new CollectionOverviewService(repository);

    await service.getOverview({ attentionLimit: 0, progressLimit: -5, upcomingLimit: 2.7 });

    expect(repository.overviewQueries[0]).toMatchObject({
      attentionLimit: 1,
      progressLimit: 1,
      upcomingLimit: 2,
    });
  });

  it('passes the dashboard filters through as an explicit scope', async () => {
    const repository = new FakeCollectionOverviewRepository();
    const service = new CollectionOverviewService(repository);

    await service.getOverview({
      entryYear: 2566,
      groupId: '00000000-0000-4000-8000-000000000002',
      roundId: '00000000-0000-4000-8000-000000000001',
    });

    expect(repository.overviewQueries[0]?.scope).toEqual({
      entryYear: 2566,
      groupId: '00000000-0000-4000-8000-000000000002',
      roundId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('bounds the per-Student page and starts without a cursor by default', async () => {
    const repository = new FakeCollectionOverviewRepository();
    const service = new CollectionOverviewService(repository);

    await service.getStudentAttention();
    await service.getStudentAttention({ limit: MAX_STUDENT_ATTENTION_LIMIT + 100 });

    expect(repository.attentionQueries[0]).toEqual({
      cursor: null,
      limit: DEFAULT_STUDENT_ATTENTION_LIMIT,
      scope: { entryYear: null, groupId: null, roundId: null },
    });
    expect(repository.attentionQueries[1]?.limit).toBe(MAX_STUDENT_ATTENTION_LIMIT);
  });

  it('resumes from a cursor it previously issued', async () => {
    const repository = new FakeCollectionOverviewRepository();
    const service = new CollectionOverviewService(repository);
    const cursor = encodeAttentionCursor({
      deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
      formId: '00000000-0000-4000-8000-000000000011',
      studentAccountId: '00000000-0000-4000-8000-000000000012',
    });

    await service.getStudentAttention({ cursor });

    expect(repository.attentionQueries[0]?.cursor).toEqual({
      deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
      formId: '00000000-0000-4000-8000-000000000011',
      studentAccountId: '00000000-0000-4000-8000-000000000012',
    });
  });

  /*
   * Silently restarting at page one would make a paging client loop forever,
   * so a cursor that does not decode is an error rather than a default.
   */
  it('rejects a malformed cursor instead of restarting the page', async () => {
    const repository = new FakeCollectionOverviewRepository();
    const service = new CollectionOverviewService(repository);

    await expect(service.getStudentAttention({ cursor: 'not-a-cursor' })).rejects.toThrow(
      CollectionOverviewError,
    );
    expect(repository.attentionQueries).toEqual([]);
  });
});
