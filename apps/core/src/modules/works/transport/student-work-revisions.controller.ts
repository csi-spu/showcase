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
import { StudentAuthService } from '../../auth/application/student-auth.service';
import { StudentBffGuard } from '../../auth/transport/student-bff.guard';
import { WorkRevisionsService } from '../application/work-revisions.service';
import { SubmitWorkRevisionDto, WithdrawWorkRevisionDto } from './work-revisions.dto';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('internal/student/works/:workPublicId/revisions')
@UseFilters(WorksExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentWorkRevisionsController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly revisions: WorkRevisionsService,
  ) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async submit(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Body() input: SubmitWorkRevisionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.revisions.submit({ ...input, actorAccountId: actor.accountId, workPublicId });
  }

  @Get('pending')
  @Header('Cache-Control', 'no-store')
  async getPending(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return { revision: await this.revisions.getPendingRevision(actor.accountId, workPublicId) };
  }

  @Post(':revisionPublicId/withdraw')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async withdraw(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Param('revisionPublicId', new ParseUUIDPipe({ version: '4' })) revisionPublicId: string,
    @Body() input: WithdrawWorkRevisionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.revisions.withdraw({
      ...input,
      actorAccountId: actor.accountId,
      revisionPublicId,
      workPublicId,
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
