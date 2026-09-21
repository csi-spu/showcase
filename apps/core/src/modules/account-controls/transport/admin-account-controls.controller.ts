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
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthService } from '../../auth/application/admin-auth.service';
import { AuthError } from '../../auth/application/auth.error';
import { AdminBffGuard } from '../../auth/transport/admin-bff.guard';
import {
  AccountControlsService,
  type StudentAccountControlsResult,
} from '../application/account-controls.service';
import type {
  AcademicYearSettings,
  AdminAccountControls,
  InstructorAccountControls,
  ListPage,
} from '../application/account-controls.ports';
import {
  CorrectStudentNameDto,
  CreateAdminDto,
  CreateInstructorDto,
  ExtendStudentAccessDto,
  InstructorRoleActionDto,
  ListAccountsQueryDto,
  ResetStudentPasswordDto,
  SetAdminStatusDto,
  SetStudentStatusDto,
  StudentAccountLookupDto,
  UpdateAcademicYearDto,
} from './account-controls.dto';
import { AccountControlsExceptionFilter } from './account-controls-exception.filter';

@Controller('internal/admin/account-controls')
@UseFilters(AccountControlsExceptionFilter)
@UseGuards(AdminBffGuard)
export class AdminAccountControlsController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly controls: AccountControlsService,
  ) {}

  @Get('academic-year')
  @Header('Cache-Control', 'no-store')
  async getAcademicYear(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AcademicYearSettings> {
    await this.authorize(authorization);
    return this.controls.getAcademicYear();
  }

  @Put('academic-year')
  @Header('Cache-Control', 'no-store')
  async updateAcademicYear(
    @Body() body: UpdateAcademicYearDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AcademicYearSettings> {
    const actor = await this.authorize(authorization);
    return this.controls.updateAcademicYear({ actorAccountId: actor.accountId, ...body });
  }

  @Get('students')
  @Header('Cache-Control', 'no-store')
  async listStudents(
    @Query() query: ListAccountsQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<ListPage<StudentAccountControlsResult>> {
    await this.authorize(authorization);
    return this.controls.listStudents({
      cursor: query.cursor ?? null,
      limit: query.limit ?? null,
      search: query.search ?? null,
    });
  }

  @Get('admins')
  @Header('Cache-Control', 'no-store')
  async listAdmins(
    @Query() query: ListAccountsQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<ListPage<AdminAccountControls>> {
    await this.authorize(authorization);
    return this.controls.listAdmins({
      cursor: query.cursor ?? null,
      limit: query.limit ?? null,
      search: query.search ?? null,
    });
  }

  @Post('admins')
  @Header('Cache-Control', 'no-store')
  async createAdmin(
    @Body() body: CreateAdminDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ admin: { adminLogin: string }; temporaryPassword: string }> {
    await this.authorize(authorization);
    return this.controls.createAdmin(body);
  }

  @Post('admins/:accountId/status')
  @Header('Cache-Control', 'no-store')
  async setAdminStatus(
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) adminAccountId: string,
    @Body() body: SetAdminStatusDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AdminAccountControls> {
    const actor = await this.authorize(authorization);
    return this.controls.setAdminStatus({
      actorAccountId: actor.accountId,
      adminAccountId,
      expectedVersion: body.expectedVersion,
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
      status: body.action,
    });
  }

  @Get('instructors')
  @Header('Cache-Control', 'no-store')
  async listInstructors(
    @Query() query: ListAccountsQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<ListPage<InstructorAccountControls>> {
    await this.authorize(authorization);
    return this.controls.listInstructors({
      cursor: query.cursor ?? null,
      limit: query.limit ?? null,
      search: query.search ?? null,
    });
  }

  @Post('instructors')
  @Header('Cache-Control', 'no-store')
  async createInstructor(
    @Body() body: CreateInstructorDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ instructor: { instructorLogin: string }; temporaryPassword: string }> {
    await this.authorize(authorization);
    return this.controls.createInstructor(body);
  }

  @Post('instructors/:accountId/grant')
  @Header('Cache-Control', 'no-store')
  async grantInstructorRole(
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) instructorAccountId: string,
    @Body() body: InstructorRoleActionDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<InstructorAccountControls> {
    const actor = await this.authorize(authorization);
    return this.controls.grantInstructorRole({
      actorAccountId: actor.accountId,
      idempotencyKey: body.idempotencyKey,
      instructorAccountId,
    });
  }

  @Post('instructors/:accountId/revoke')
  @Header('Cache-Control', 'no-store')
  async revokeInstructorRole(
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) instructorAccountId: string,
    @Body() body: InstructorRoleActionDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<InstructorAccountControls> {
    const actor = await this.authorize(authorization);
    return this.controls.revokeInstructorRole({
      actorAccountId: actor.accountId,
      idempotencyKey: body.idempotencyKey,
      instructorAccountId,
    });
  }

  @Post('students/lookup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async findStudent(
    @Body() body: StudentAccountLookupDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StudentAccountControlsResult> {
    await this.authorize(authorization);
    return this.controls.findStudent(body.studentId);
  }

  @Post('students/:accountId/status')
  @Header('Cache-Control', 'no-store')
  async setStudentStatus(
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Body() body: SetStudentStatusDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StudentAccountControlsResult> {
    const actor = await this.authorize(authorization);
    return this.controls.setStudentStatus({
      actorAccountId: actor.accountId,
      expectedVersion: body.expectedVersion,
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
      status: body.action,
      studentAccountId,
    });
  }

  @Post('students/:accountId/access-extension')
  @Header('Cache-Control', 'no-store')
  async extendStudentAccess(
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Body() body: ExtendStudentAccessDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StudentAccountControlsResult> {
    const actor = await this.authorize(authorization);
    return this.controls.extendStudentAccess({
      actorAccountId: actor.accountId,
      studentAccountId,
      ...body,
    });
  }

  @Post('students/:accountId/password-reset')
  @Header('Cache-Control', 'no-store')
  async resetStudentPassword(
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Body() body: ResetStudentPasswordDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{
    student: StudentAccountControlsResult;
    temporaryPassword: string;
  }> {
    const actor = await this.authorize(authorization);
    return this.controls.resetStudentPassword({
      actorAccountId: actor.accountId,
      studentAccountId,
      ...body,
    });
  }

  @Put('students/:accountId/name')
  @Header('Cache-Control', 'no-store')
  async correctStudentName(
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Body() body: CorrectStudentNameDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StudentAccountControlsResult> {
    const actor = await this.authorize(authorization);
    return this.controls.correctStudentName({
      actorAccountId: actor.accountId,
      studentAccountId,
      ...body,
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
    return this.auth.authorizeAdmin(token);
  }
}
