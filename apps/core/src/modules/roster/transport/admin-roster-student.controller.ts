import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthService } from '../../auth/application/admin-auth.service';
import { AuthError } from '../../auth/application/auth.error';
import { AdminBffGuard } from '../../auth/transport/admin-bff.guard';
import { RosterImportService } from '../application/roster-import.service';
import type { RosterBatch } from '../application/roster.ports';
import { RosterExceptionFilter } from './roster-exception.filter';
import { CreateRosterStudentDto } from './roster-student.dto';

@Controller('internal/admin/roster-students')
@UseFilters(RosterExceptionFilter)
@UseGuards(AdminBffGuard)
export class AdminRosterStudentController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly roster: RosterImportService,
  ) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async createStudent(
    @Body() body: CreateRosterStudentDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<RosterBatch> {
    const actor = await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    return this.roster.createStudent({
      actorAccountId: actor.accountId,
      firstNameTh: body.firstNameTh,
      lastNameTh: body.lastNameTh,
      studentId: body.studentId,
    });
  }

  private requireSessionToken(authorization: string | undefined): string {
    const prefix = 'Bearer ';
    const token = authorization?.startsWith(prefix)
      ? authorization.slice(prefix.length).trim()
      : '';
    if (token.length === 0 || token.length > 512) {
      throw new AuthError('UNAUTHENTICATED', 401);
    }
    return token;
  }
}
