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
import type { AcademicYearSettings } from '../application/account-controls.ports';
import {
  ExtendStudentAccessDto,
  ResetStudentPasswordDto,
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
