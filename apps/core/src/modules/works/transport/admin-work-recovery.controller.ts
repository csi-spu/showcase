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
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthService } from '../../auth/application/admin-auth.service';
import { AuthError } from '../../auth/application/auth.error';
import { AdminBffGuard } from '../../auth/transport/admin-bff.guard';
import { WorkRecoveryService } from '../application/work-recovery.service';
import { AttributionRemovalService } from '../application/attribution-removal.service';
import {
  ApproveAttributionRemovalRequestDto,
  DeclineAttributionRemovalRequestDto,
  DecideRemovalRequestDto,
  RemovalRequestQueueQueryDto,
  WorkRecoveryTransitionDto,
} from './work-recovery.dto';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('internal/admin')
@UseFilters(WorksExceptionFilter)
@UseGuards(AdminBffGuard)
export class AdminWorkRecoveryController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly recovery: WorkRecoveryService,
    private readonly attributionRemoval: AttributionRemovalService,
  ) {}

  @Get('removal-requests')
  @Header('Cache-Control', 'no-store')
  async listPending(
    @Query() query: RemovalRequestQueueQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeAdmin(this.sessionToken(authorization));
    return { items: await this.recovery.listPendingRemovalRequests(query.limit) };
  }

  @Get('attribution-removal-requests')
  @Header('Cache-Control', 'no-store')
  async listPendingAttributionRemoval(
    @Query() query: RemovalRequestQueueQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeAdmin(this.sessionToken(authorization));
    return this.attributionRemoval.listPending(query.limit, query.cursor);
  }

  @Post('attribution-removal-requests/:requestPublicId/decline')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async declineAttributionRemoval(
    @Param('requestPublicId', new ParseUUIDPipe({ version: '4' })) requestPublicId: string,
    @Body() input: DeclineAttributionRemovalRequestDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeAdmin(this.sessionToken(authorization));
    return this.attributionRemoval.decline({
      ...input,
      actorAccountId: actor.accountId,
      requestPublicId,
    });
  }

  @Post('attribution-removal-requests/:requestPublicId/approve-and-publish-removal')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async approveAttributionRemoval(
    @Param('requestPublicId', new ParseUUIDPipe({ version: '4' })) requestPublicId: string,
    @Body() input: ApproveAttributionRemovalRequestDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeAdmin(this.sessionToken(authorization));
    return this.attributionRemoval.approveAndPublish({
      ...input,
      actorAccountId: actor.accountId,
      requestPublicId,
    });
  }

  @Post('removal-requests/:requestPublicId/decision')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async decide(
    @Param('requestPublicId', new ParseUUIDPipe({ version: '4' })) requestPublicId: string,
    @Body() input: DecideRemovalRequestDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeAdmin(this.sessionToken(authorization));
    return this.recovery.decideRemovalRequest({
      ...input,
      actorAccountId: actor.accountId,
      requestPublicId,
    });
  }

  @Get('works/:workPublicId/recovery-state')
  @Header('Cache-Control', 'no-store')
  async getState(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeAdmin(this.sessionToken(authorization));
    return this.recovery.getState(workPublicId);
  }

  @Post('works/:workPublicId/recovery')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async transition(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Body() input: WorkRecoveryTransitionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeAdmin(this.sessionToken(authorization));
    return this.recovery.transition({ ...input, actorAccountId: actor.accountId, workPublicId });
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
