import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { InstructorAuthService } from '../../auth/application/instructor-auth.service';
import { InstructorBffGuard } from '../../auth/transport/instructor-bff.guard';
import { CollectionGroupsService } from '../application/collection-groups.service';
import type {
  CollectionGroup,
  CollectionRound,
  GroupMember,
  SelectableStudent,
  StudentIdResolution,
} from '../application/collection-groups.ports';
import {
  AddMembersDto,
  CreateGroupWithMembersDto,
  CreateRoundDto,
  CreateRoundWithGroupAndMembersDto,
  MAX_STUDENT_PAGE_SIZE,
  ReinstateMemberDto,
  ResolveStudentIdsDto,
  SearchStudentsDto,
  SelectAllStudentsDto,
  WithdrawMemberDto,
} from './collection-groups.dto';
import { CollectionGroupsExceptionFilter } from './collection-groups-exception.filter';

@Controller('internal/instructor')
@UseFilters(CollectionGroupsExceptionFilter)
@UseGuards(InstructorBffGuard)
export class InstructorCollectionGroupsController {
  constructor(
    private readonly auth: InstructorAuthService,
    private readonly groups: CollectionGroupsService,
  ) {}

  @Post('rounds')
  @Header('Cache-Control', 'no-store')
  async createRound(
    @Body() body: CreateRoundDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionRound> {
    const actor = await this.authorize(authorization);
    return this.groups.createRound({ actorAccountId: actor.accountId, name: body.name });
  }

  @Post('rounds/with-group')
  @Header('Cache-Control', 'no-store')
  async createRoundWithGroup(
    @Body() body: CreateRoundWithGroupAndMembersDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ group: CollectionGroup; round: CollectionRound }> {
    const actor = await this.authorize(authorization);
    return this.groups.createRoundWithGroupAndMembers({
      actorAccountId: actor.accountId,
      groupName: body.groupName,
      idempotencyKey: body.idempotencyKey,
      memberAccountIds: body.memberAccountIds,
      roundName: body.roundName,
    });
  }

  @Get('rounds')
  @Header('Cache-Control', 'no-store')
  async listRounds(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionRound[]> {
    await this.authorize(authorization);
    return this.groups.listRounds();
  }

  @Post('rounds/:roundId/groups')
  @Header('Cache-Control', 'no-store')
  async createGroup(
    @Param('roundId', new ParseUUIDPipe({ version: '4' })) roundId: string,
    @Body() body: CreateGroupWithMembersDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionGroup> {
    const actor = await this.authorize(authorization);
    return this.groups.createGroupWithMembers({
      actorAccountId: actor.accountId,
      idempotencyKey: body.idempotencyKey,
      memberAccountIds: body.memberAccountIds,
      name: body.name,
      roundId,
    });
  }

  @Get('rounds/:roundId/groups')
  @Header('Cache-Control', 'no-store')
  async listGroups(
    @Param('roundId', new ParseUUIDPipe({ version: '4' })) roundId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionGroup[]> {
    await this.authorize(authorization);
    return this.groups.listGroups(roundId);
  }

  @Get('groups/:groupId')
  @Header('Cache-Control', 'no-store')
  async getGroup(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ group: CollectionGroup; members: GroupMember[] }> {
    await this.authorize(authorization);
    return this.groups.getGroup(groupId);
  }

  @Post('groups/:groupId/members')
  @Header('Cache-Control', 'no-store')
  async addMembers(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() body: AddMembersDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ added: number; alreadyMember: number }> {
    const actor = await this.authorize(authorization);
    return this.groups.addMembers({
      actorAccountId: actor.accountId,
      groupId,
      memberAccountIds: body.memberAccountIds,
    });
  }

  @Post('students/search')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async listStudents(
    @Body() body: SearchStudentsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{
    hasCurrentAcademicYear: boolean;
    nextCursor: string | null;
    students: SelectableStudent[];
  }> {
    await this.authorize(authorization);
    return this.groups.listStudents({
      cursor: body.cursor ?? null,
      entryYear: body.entryYear ?? null,
      groupId: body.groupId ?? null,
      limit: body.limit ?? MAX_STUDENT_PAGE_SIZE,
      query: body.q ?? null,
    });
  }

  @Get('students/entry-years')
  @Header('Cache-Control', 'no-store')
  async listEntryYears(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ entryYears: number[] }> {
    await this.authorize(authorization);
    return { entryYears: await this.groups.listEntryYears() };
  }

  @Post('students/select-all')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async selectAllStudents(
    @Body() body: SelectAllStudentsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ students: SelectableStudent[] }> {
    await this.authorize(authorization);
    return {
      students: await this.groups.selectAllMatching({
        entryYear: body.entryYear ?? null,
        groupId: body.groupId ?? null,
        query: body.q ?? null,
        selectedCount: body.selectedCount,
      }),
    };
  }

  @Post('students/resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async resolveStudentIds(
    @Body() body: ResolveStudentIdsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ results: StudentIdResolution[] }> {
    await this.authorize(authorization);
    return {
      results: await this.groups.resolveStudentIds({
        groupId: body.groupId ?? null,
        studentIds: body.studentIds,
      }),
    };
  }

  @Post('groups/:groupId/members/:studentAccountId/withdraw')
  @Header('Cache-Control', 'no-store')
  async withdrawMember(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('studentAccountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Body() body: WithdrawMemberDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GroupMember> {
    const actor = await this.authorize(authorization);
    return this.groups.withdrawMember({
      actorAccountId: actor.accountId,
      groupId,
      reason: body.reason,
      studentAccountId,
    });
  }

  @Post('groups/:groupId/members/:studentAccountId/reinstate')
  @Header('Cache-Control', 'no-store')
  async reinstateMember(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('studentAccountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Body() body: ReinstateMemberDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GroupMember> {
    const actor = await this.authorize(authorization);
    return this.groups.reinstateMember({
      actorAccountId: actor.accountId,
      groupId,
      reason: body.reason,
      studentAccountId,
    });
  }

  private authorize(authorization: string | undefined): Promise<{ accountId: string }> {
    const prefix = 'Bearer ';
    const token = authorization?.startsWith(prefix)
      ? authorization.slice(prefix.length).trim()
      : '';
    if (token.length === 0 || token.length > 512) {
      throw new AuthError('UNAUTHENTICATED', 401);
    }
    return this.auth.authorizeInstructor(token);
  }
}
