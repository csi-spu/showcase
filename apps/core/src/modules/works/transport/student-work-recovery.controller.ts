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
import { WorkRecoveryService } from '../application/work-recovery.service';
import { CancelRemovalRequestDto, CreateRemovalRequestDto } from './work-recovery.dto';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('internal/student')
@UseFilters(WorksExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentWorkRecoveryController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly recovery: WorkRecoveryService,
  ) {}

  @Get('works/:workPublicId/recovery-state')
  @Header('Cache-Control', 'no-store')
  async getState(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.recovery.getOwnedState(actor.accountId, workPublicId);
  }

  @Post('works/:workPublicId/removal-requests')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async createRemovalRequest(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Body() input: CreateRemovalRequestDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.recovery.createRemovalRequest({
      ...input,
      actorAccountId: actor.accountId,
      workPublicId,
    });
  }

  @Get('works/:workPublicId/removal-request')
  @Header('Cache-Control', 'no-store')
  async getPendingRemovalRequest(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return {
      request: await this.recovery.getOwnedPendingRemovalRequest(actor.accountId, workPublicId),
    };
  }

  @Post('removal-requests/:requestPublicId/cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async cancelRemovalRequest(
    @Param('requestPublicId', new ParseUUIDPipe({ version: '4' })) requestPublicId: string,
    @Body() input: CancelRemovalRequestDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.recovery.cancelRemovalRequest({
      ...input,
      actorAccountId: actor.accountId,
      requestPublicId,
    });
  }

  private sessionToken(authorization: string | undefined): string {
    const prefix = 'Bearer ';
    const token = authorization?.startsWith(prefix)
      ? authorization.slice(prefix.length).trim()
      : '';
    if (token.length === 0 || token.length > 512) throw new AuthError('UNAUTHENTICATED', 401);
    return token;
  }
}
