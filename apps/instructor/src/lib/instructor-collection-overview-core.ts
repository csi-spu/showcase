import 'server-only';
import { CoreClient } from '@showcase/core-client';
import { z } from 'zod';
import { studentIdSchema } from './member-selection-contract';

/*
 * One row of the "needs attention" list: a form that still has work waiting on
 * it, carried with the round and group it belongs to so the dashboard can link
 * straight to it instead of making the reader find it again.
 */
const attentionItemSchema = z
  .object({
    /* Null for a form with no deadline set, which is allowed. */
    deadlineAt: z.iso.datetime().nullable(),
    formId: z.uuid(),
    formTitle: z.string().min(1),
    groupId: z.uuid(),
    groupName: z.string().min(1),
    roundId: z.uuid(),
    roundName: z.string().min(1),
    studentsNotSubmitted: z.number().int(),
    submissionsPendingReview: z.number().int(),
  })
  .strict();

/*
 * A form whose deadline is still ahead. `deadlineAt` is never null here --
 * Core excludes forms without one, because a form with no deadline cannot be
 * near it -- so the rail never has to render a row with nothing to count down.
 */
const upcomingDeadlineSchema = z
  .object({
    deadlineAt: z.iso.datetime(),
    formId: z.uuid(),
    formTitle: z.string().min(1),
    groupId: z.uuid(),
    groupName: z.string().min(1),
    roundId: z.uuid(),
    roundName: z.string().min(1),
    studentsNotSubmitted: z.number().int(),
  })
  .strict();

/* One open form as a completed-of-total pair, for a progress bar. */
const formProgressSchema = z
  .object({
    completedStudents: z.number().int(),
    deadlineAt: z.iso.datetime().nullable(),
    formId: z.uuid(),
    formTitle: z.string().min(1),
    groupId: z.uuid(),
    groupName: z.string().min(1),
    roundId: z.uuid(),
    roundName: z.string().min(1),
    totalStudents: z.number().int(),
  })
  .strict();

/*
 * The three completion buckets partition `studentsWithObligations`, NOT
 * `students`: a current member of a group with no open form yet holds no
 * obligation and belongs in neither. The donut is drawn over
 * `studentsWithObligations` for that reason -- over `students` it would not
 * close.
 */
const activeRoundTotalsSchema = z
  .object({
    groups: z.number().int(),
    students: z.number().int(),
    studentsFullyComplete: z.number().int(),
    studentsPartiallyComplete: z.number().int(),
    studentsWithNoSubmission: z.number().int(),
    studentsWithObligations: z.number().int(),
    submissionsPendingReview: z.number().int(),
  })
  .strict();

const overviewSchema = z
  .object({
    activeFormProgress: z.array(formProgressSchema),
    activeRoundTotals: activeRoundTotalsSchema,
    needsAttention: z.array(attentionItemSchema),
    roundCounts: z.object({ active: z.number().int(), closed: z.number().int() }).strict(),
    upcomingDeadlines: z.array(upcomingDeadlineSchema),
  })
  .strict();

/**
 * One Student's outstanding obligation, identified by Roster name and Student
 * ID (ADR 0020). The Student ID is null until a Roster import records it.
 */
const studentAttentionRowSchema = z
  .object({
    deadlineAt: z.iso.datetime().nullable(),
    firstNameTh: z.string().min(1),
    formId: z.uuid(),
    formTitle: z.string().min(1),
    groupId: z.uuid(),
    groupName: z.string().min(1),
    /* The deadline exists and has passed while the row is still outstanding:
       overdue, not "submitted late". */
    isLate: z.boolean(),
    lastNameTh: z.string().min(1),
    roundId: z.uuid(),
    roundName: z.string().min(1),
    status: z.enum(['not_submitted', 'awaiting_checking', 'changes_required']),
    studentAccountId: z.uuid(),
    studentId: studentIdSchema,
  })
  .strict();

const studentAttentionPageSchema = z
  .object({ nextCursor: z.string().nullable(), rows: z.array(studentAttentionRowSchema) })
  .strict();

const filterOptionsSchema = z
  .object({
    entryYears: z.array(z.number().int()),
    groups: z.array(
      z.object({ id: z.uuid(), name: z.string().min(1), roundId: z.uuid() }).strict(),
    ),
    rounds: z.array(
      z.object({ id: z.uuid(), name: z.string().min(1), status: z.string().min(1) }).strict(),
    ),
  })
  .strict();

export type InstructorCollectionAttentionItem = z.infer<typeof attentionItemSchema>;
export type InstructorCollectionUpcomingDeadline = z.infer<typeof upcomingDeadlineSchema>;
export type InstructorCollectionFormProgress = z.infer<typeof formProgressSchema>;
export type InstructorCollectionOverview = z.infer<typeof overviewSchema>;
export type InstructorStudentAttentionRow = z.infer<typeof studentAttentionRowSchema>;
export type InstructorStudentAttentionPage = z.infer<typeof studentAttentionPageSchema>;
export type InstructorCollectionFilterOptions = z.infer<typeof filterOptionsSchema>;

/** The dashboard's dropdowns, as a scope every read shares. */
export interface InstructorCollectionScope {
  entryYear?: number | undefined;
  groupId?: string | undefined;
  roundId?: string | undefined;
}

/*
 * Absent scope fields mean "every active round", so an unset dropdown must
 * send nothing rather than an empty string -- Core rejects unknown and
 * malformed query values, and `?roundId=` is not a uuid.
 */
function toScopeParams(scope: InstructorCollectionScope): URLSearchParams {
  const params = new URLSearchParams();
  if (scope.roundId !== undefined) params.set('roundId', scope.roundId);
  if (scope.groupId !== undefined) params.set('groupId', scope.groupId);
  if (scope.entryYear !== undefined) params.set('entryYear', String(scope.entryYear));
  return params;
}

interface InstructorCollectionOverviewCoreConfig {
  coreUrl: string;
  instructorBffSecret: string;
}

export class InstructorCollectionOverviewCoreClient {
  private readonly client: CoreClient;

  constructor(config: InstructorCollectionOverviewCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-instructor-bff-secret', value: config.instructorBffSecret },
      fetchImpl,
    });
  }

  getOverview(
    sessionToken: string,
    scope: InstructorCollectionScope = {},
  ): Promise<InstructorCollectionOverview> {
    const params = toScopeParams(scope);
    const suffix = params.size === 0 ? '' : `?${params.toString()}`;
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/instructor/overview${suffix}`,
      responseSchema: overviewSchema,
      sessionToken,
    });
  }

  /**
   * One cursor page of Students with outstanding work.
   *
   * Separate from the aggregate above because it is paginated: the dashboard
   * shows the first page, and the follow-up list walks the rest.
   */
  getStudentAttention(
    sessionToken: string,
    input: InstructorCollectionScope & { cursor?: string | undefined; limit?: number | undefined },
  ): Promise<InstructorStudentAttentionPage> {
    const params = toScopeParams(input);
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    if (input.cursor !== undefined) params.set('cursor', input.cursor);
    const suffix = params.size === 0 ? '' : `?${params.toString()}`;
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/instructor/students/attention${suffix}`,
      responseSchema: studentAttentionPageSchema,
      sessionToken,
    });
  }

  getFilterOptions(sessionToken: string): Promise<InstructorCollectionFilterOptions> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/instructor/filters',
      responseSchema: filterOptionsSchema,
      sessionToken,
    });
  }
}
