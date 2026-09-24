import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { InstructorAuthService } from '../../auth/application/instructor-auth.service';
import { CollectionOverviewService } from '../application/collection-overview.service';
import {
  CollectionOverviewQueryDto,
  CollectionStudentAttentionQueryDto,
} from './collection-overview.dto';
import { InstructorCollectionOverviewController } from './instructor-collection-overview.controller';

const ROUND_ID = '00000000-0000-4000-8000-000000000001';
const GROUP_ID = '00000000-0000-4000-8000-000000000002';
const FORM_ID = '00000000-0000-4000-8000-000000000003';
const STUDENT_ACCOUNT_ID = '00000000-0000-4000-8000-000000000004';

const validation = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});

function validateQuery(metatype: unknown, value: Record<string, unknown>): Promise<unknown> {
  return validation.transform(value, {
    data: undefined,
    metatype: metatype as new () => unknown,
    type: 'query',
  });
}

describe('InstructorCollectionOverviewController', () => {
  const authorizeInstructor = jest.fn().mockResolvedValue({ accountId: 'actor-account' });
  const overviewResult = {
    activeFormProgress: [
      {
        completedStudents: 87,
        deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
        formId: FORM_ID,
        formTitle: 'แบบฟอร์มหนึ่ง',
        groupId: GROUP_ID,
        groupName: 'กลุ่มหนึ่ง',
        roundId: ROUND_ID,
        roundName: 'รอบที่เปิด',
        totalStudents: 124,
      },
    ],
    activeRoundTotals: {
      groups: 1,
      students: 2,
      studentsFullyComplete: 1,
      studentsPartiallyComplete: 0,
      studentsWithNoSubmission: 1,
      studentsWithObligations: 2,
      submissionsPendingReview: 1,
    },
    needsAttention: [],
    roundCounts: { active: 1, closed: 0 },
    upcomingDeadlines: [
      {
        deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
        formId: FORM_ID,
        formTitle: 'แบบฟอร์มหนึ่ง',
        groupId: GROUP_ID,
        groupName: 'กลุ่มหนึ่ง',
        roundId: ROUND_ID,
        roundName: 'รอบที่เปิด',
        studentsNotSubmitted: 37,
      },
    ],
  };
  const attentionPage = {
    nextCursor: 'opaque-cursor',
    rows: [
      {
        deadlineAt: new Date('2026-09-25T04:00:00.000Z'),
        firstNameTh: 'นักศึกษาเอ',
        formId: FORM_ID,
        formTitle: 'แบบฟอร์มหนึ่ง',
        groupId: GROUP_ID,
        groupName: 'กลุ่มหนึ่ง',
        isLate: true,
        lastNameTh: 'นามสกุลเอ',
        roundId: ROUND_ID,
        roundName: 'รอบที่เปิด',
        status: 'not_submitted' as const,
        studentAccountId: STUDENT_ACCOUNT_ID,
      },
    ],
  };
  const getOverview = jest.fn().mockResolvedValue(overviewResult);
  const getStudentAttention = jest.fn().mockResolvedValue(attentionPage);
  const getFilterOptions = jest
    .fn()
    .mockResolvedValue({ entryYears: [2566], groups: [], rounds: [] });
  const controller = new InstructorCollectionOverviewController(
    { authorizeInstructor } as unknown as InstructorAuthService,
    { getFilterOptions, getOverview, getStudentAttention } as unknown as CollectionOverviewService,
  );

  beforeEach(() => {
    authorizeInstructor.mockClear();
    getOverview.mockClear();
    getStudentAttention.mockClear();
    getFilterOptions.mockClear();
  });

  it('authorizes the Instructor session and serializes timestamps as UTC ISO-8601', async () => {
    const query = new CollectionOverviewQueryDto();
    query.attentionLimit = 3;
    query.upcomingLimit = 2;
    query.progressLimit = 4;
    query.roundId = ROUND_ID;

    const result = await controller.getOverview(query, 'Bearer opaque-session');

    expect(authorizeInstructor).toHaveBeenCalledWith('opaque-session');
    expect(getOverview).toHaveBeenCalledWith({
      attentionLimit: 3,
      entryYear: undefined,
      groupId: undefined,
      progressLimit: 4,
      roundId: ROUND_ID,
      upcomingLimit: 2,
    });
    expect(result.upcomingDeadlines[0]?.deadlineAt).toBe('2026-09-25T04:00:00.000Z');
    expect(result.activeFormProgress[0]?.deadlineAt).toBe('2026-09-25T04:00:00.000Z');
    expect(result.activeRoundTotals.studentsFullyComplete).toBe(1);
  });

  /*
   * Core retains only a keyed hash of the Student ID, so no read path can
   * produce one. The follow-up row identifies a Student by Roster name and
   * account id instead.
   */
  it('returns follow-up rows that carry no Student ID', async () => {
    const query = new CollectionStudentAttentionQueryDto();
    query.limit = 20;

    const result = await controller.getStudentAttention(query, 'Bearer opaque-session');

    expect(result.nextCursor).toBe('opaque-cursor');
    expect(result.rows[0]).toEqual({
      deadlineAt: '2026-09-25T04:00:00.000Z',
      firstNameTh: 'นักศึกษาเอ',
      formId: FORM_ID,
      formTitle: 'แบบฟอร์มหนึ่ง',
      groupId: GROUP_ID,
      groupName: 'กลุ่มหนึ่ง',
      isLate: true,
      lastNameTh: 'นามสกุลเอ',
      roundId: ROUND_ID,
      roundName: 'รอบที่เปิด',
      status: 'not_submitted',
      studentAccountId: STUDENT_ACCOUNT_ID,
    });
    expect(Object.keys(result.rows[0] ?? {})).not.toContain('studentId');
  });

  it('rejects an unauthenticated request before reading anything', async () => {
    await expect(
      controller.getStudentAttention(new CollectionStudentAttentionQueryDto(), undefined),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(getStudentAttention).not.toHaveBeenCalled();
  });

  it('rejects unknown query fields under the Core validation policy', async () => {
    await expect(
      validateQuery(CollectionOverviewQueryDto, { unexpected: 'true' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateQuery(CollectionStudentAttentionQueryDto, { unexpected: 'true' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['attentionLimit above its bound', { attentionLimit: '11' }],
    ['attentionLimit below its bound', { attentionLimit: '0' }],
    ['upcomingLimit above its bound', { upcomingLimit: '11' }],
    ['progressLimit above its bound', { progressLimit: '13' }],
    ['a non-uuid roundId', { roundId: 'not-a-uuid' }],
    ['a non-uuid groupId', { groupId: 'not-a-uuid' }],
    ['an implausible entryYear', { entryYear: '20260924' }],
  ])('rejects %s on the overview', async (_label, value) => {
    await expect(validateQuery(CollectionOverviewQueryDto, value)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    ['limit above its bound', { limit: '51' }],
    ['limit below its bound', { limit: '0' }],
    ['a cursor that is not URL-safe', { cursor: 'has spaces' }],
    ['an oversized cursor', { cursor: 'a'.repeat(257) }],
  ])('rejects %s on the follow-up list', async (_label, value) => {
    await expect(validateQuery(CollectionStudentAttentionQueryDto, value)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts the documented bounds and coerces numeric query strings', async () => {
    await expect(
      validateQuery(CollectionOverviewQueryDto, {
        attentionLimit: '10',
        entryYear: '2566',
        progressLimit: '12',
        roundId: ROUND_ID,
        upcomingLimit: '10',
      }),
    ).resolves.toMatchObject({
      attentionLimit: 10,
      entryYear: 2566,
      progressLimit: 12,
      upcomingLimit: 10,
    });
  });

  it('returns the bounded dropdown sources', async () => {
    await expect(controller.getFilters('Bearer opaque-session')).resolves.toEqual({
      entryYears: [2566],
      groups: [],
      rounds: [],
    });
    expect(authorizeInstructor).toHaveBeenCalledWith('opaque-session');
  });
});
