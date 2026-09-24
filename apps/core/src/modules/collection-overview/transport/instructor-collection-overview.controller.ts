import { Controller, Get, Header, Headers, Query, UseFilters, UseGuards } from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { InstructorAuthService } from '../../auth/application/instructor-auth.service';
import { InstructorBffGuard } from '../../auth/transport/instructor-bff.guard';
import { CollectionOverviewService } from '../application/collection-overview.service';
import {
  CollectionOverviewQueryDto,
  CollectionStudentAttentionQueryDto,
} from './collection-overview.dto';
import { CollectionOverviewExceptionFilter } from './collection-overview-exception.filter';
import type {
  CollectionFilterOptionsResponse,
  CollectionOverviewResponse,
  CollectionStudentAttentionResponse,
} from './collection-overview.response';

@Controller('internal/instructor')
@UseFilters(CollectionOverviewExceptionFilter)
@UseGuards(InstructorBffGuard)
export class InstructorCollectionOverviewController {
  constructor(
    private readonly auth: InstructorAuthService,
    private readonly overview: CollectionOverviewService,
  ) {}

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  async getOverview(
    @Query() query: CollectionOverviewQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionOverviewResponse> {
    await this.auth.authorizeInstructor(this.requireSessionToken(authorization));
    const result = await this.overview.getOverview({
      attentionLimit: query.attentionLimit,
      entryYear: query.entryYear,
      groupId: query.groupId,
      progressLimit: query.progressLimit,
      roundId: query.roundId,
      upcomingLimit: query.upcomingLimit,
    });

    return {
      activeFormProgress: result.activeFormProgress.map((item) => ({
        completedStudents: item.completedStudents,
        deadlineAt: item.deadlineAt?.toISOString() ?? null,
        formId: item.formId,
        formTitle: item.formTitle,
        groupId: item.groupId,
        groupName: item.groupName,
        roundId: item.roundId,
        roundName: item.roundName,
        totalStudents: item.totalStudents,
      })),
      activeRoundTotals: result.activeRoundTotals,
      needsAttention: result.needsAttention.map((item) => ({
        deadlineAt: item.deadlineAt?.toISOString() ?? null,
        formId: item.formId,
        formTitle: item.formTitle,
        groupId: item.groupId,
        groupName: item.groupName,
        roundId: item.roundId,
        roundName: item.roundName,
        studentsNotSubmitted: item.studentsNotSubmitted,
        submissionsPendingReview: item.submissionsPendingReview,
      })),
      roundCounts: result.roundCounts,
      upcomingDeadlines: result.upcomingDeadlines.map((item) => ({
        deadlineAt: item.deadlineAt.toISOString(),
        formId: item.formId,
        formTitle: item.formTitle,
        groupId: item.groupId,
        groupName: item.groupName,
        roundId: item.roundId,
        roundName: item.roundName,
        studentsNotSubmitted: item.studentsNotSubmitted,
      })),
    };
  }

  /**
   * The per-Student follow-up table.
   *
   * Rows carry Roster names so an Instructor can recognise a Student. They
   * carry no Student ID, and neither does the cursor.
   */
  @Get('students/attention')
  @Header('Cache-Control', 'no-store')
  async getStudentAttention(
    @Query() query: CollectionStudentAttentionQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionStudentAttentionResponse> {
    await this.auth.authorizeInstructor(this.requireSessionToken(authorization));
    const page = await this.overview.getStudentAttention({
      cursor: query.cursor,
      entryYear: query.entryYear,
      groupId: query.groupId,
      limit: query.limit,
      roundId: query.roundId,
    });

    return {
      nextCursor: page.nextCursor,
      rows: page.rows.map((row) => ({
        deadlineAt: row.deadlineAt?.toISOString() ?? null,
        firstNameTh: row.firstNameTh,
        formId: row.formId,
        formTitle: row.formTitle,
        groupId: row.groupId,
        groupName: row.groupName,
        isLate: row.isLate,
        lastNameTh: row.lastNameTh,
        roundId: row.roundId,
        roundName: row.roundName,
        status: row.status,
        studentAccountId: row.studentAccountId,
      })),
    };
  }

  @Get('filters')
  @Header('Cache-Control', 'no-store')
  async getFilters(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionFilterOptionsResponse> {
    await this.auth.authorizeInstructor(this.requireSessionToken(authorization));
    return this.overview.getFilterOptions();
  }

  private requireSessionToken(authorization: string | undefined): string {
    const prefix = 'Bearer ';
    const sessionToken = authorization?.startsWith(prefix)
      ? authorization.slice(prefix.length).trim()
      : '';
    if (sessionToken.length === 0 || sessionToken.length > 512) {
      throw new AuthError('UNAUTHENTICATED', 401);
    }
    return sessionToken;
  }
}
