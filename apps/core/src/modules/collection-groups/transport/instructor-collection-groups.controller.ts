import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
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
  AddMembersByEntryYearResult,
  AddMembersResult,
  CollectionGroup,
  CollectionRound,
  GroupMember,
} from '../application/collection-groups.ports';
import {
  AddMemberIndividualDto,
  AddMembersByEntryYearDto,
  AddMembersByStudentIdsDto,
  CreateGroupDto,
  CreateRoundDto,
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
    @Body() body: CreateGroupDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionGroup> {
    const actor = await this.authorize(authorization);
    return this.groups.createGroup({ actorAccountId: actor.accountId, name: body.name, roundId });
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

  @Post('groups/:groupId/members/by-student-ids')
  @Header('Cache-Control', 'no-store')
  async addMembersByStudentIds(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() body: AddMembersByStudentIdsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AddMembersResult> {
    const actor = await this.authorize(authorization);
    return this.groups.addMembersByStudentIds({
      actorAccountId: actor.accountId,
      groupId,
      studentIds: body.studentIds,
    });
  }

  @Post('groups/:groupId/members/individual')
  @Header('Cache-Control', 'no-store')
  async addMemberIndividually(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() body: AddMemberIndividualDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AddMembersResult> {
    const actor = await this.authorize(authorization);
    return this.groups.addMemberIndividually({
      actorAccountId: actor.accountId,
      groupId,
      studentId: body.studentId,
    });
  }

  @Post('groups/:groupId/members/by-entry-year')
  @Header('Cache-Control', 'no-store')
  async addMembersByEntryYear(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() body: AddMembersByEntryYearDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AddMembersByEntryYearResult> {
    const actor = await this.authorize(authorization);
    return this.groups.addMembersByEntryYear({
      actorAccountId: actor.accountId,
      entryYear: body.entryYear,
      groupId,
    });
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
