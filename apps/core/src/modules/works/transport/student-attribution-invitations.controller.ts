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
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthError } from '../../auth/application/auth.error';
import { StudentAuthService } from '../../auth/application/student-auth.service';
import { StudentBffGuard } from '../../auth/transport/student-bff.guard';
import { AttributionInvitationsService } from '../application/attribution-invitations.service';
import { AttributionRemovalService } from '../application/attribution-removal.service';
import {
  AcceptAccountAttributionDto,
  AcceptExternalAttributionDto,
  CreateAccountAttributionInvitationDto,
  CreateExternalAttributionInvitationDto,
  ExchangeExternalAttributionTokenDto,
  ExchangeExternalRecoveryCodeDto,
  InvitationPageQueryDto,
  InvitationTransitionDto,
} from './attribution-invitations.dto';
import { WorksExceptionFilter } from './works-exception.filter';
import { CreateAttributionRemovalRequestDto } from './work-recovery.dto';

@Controller('internal/student')
@UseFilters(WorksExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentAttributionInvitationsController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly invitations: AttributionInvitationsService,
    private readonly attributionRemoval: AttributionRemovalService,
  ) {}

  @Post('works/:publicId/contributor-invitations/account')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async createAccountInvitation(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Body() input: CreateAccountAttributionInvitationDto,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.invitations.createAccountInvitation({
      ...input,
      actorAccountId: actor.accountId,
      publicId,
      sourceAddress: request.ip ?? 'unknown',
    });
  }

  @Post('works/:publicId/contributor-invitations/external')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async createExternalInvitation(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Body() input: CreateExternalAttributionInvitationDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.invitations.createExternalInvitation({
      ...input,
      actorAccountId: actor.accountId,
      publicId,
    });
  }

  @Get('works/:publicId/contributor-invitations')
  @Header('Cache-Control', 'no-store')
  async listWorkInvitations(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Query() query: InvitationPageQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.invitations.listWorkInvitations(
      actor.accountId,
      publicId,
      query.limit,
      query.cursor,
    );
  }

  @Post('works/:publicId/contributor-invitations/:invitationPublicId/revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async revokeInvitation(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Param('invitationPublicId', new ParseUUIDPipe({ version: '4' })) invitationPublicId: string,
    @Body() input: InvitationTransitionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.invitations.revokeInvitation({
      ...input,
      actorAccountId: actor.accountId,
      invitationPublicId,
      publicId,
    });
  }

  @Get('contributor-invitations')
  @Header('Cache-Control', 'no-store')
  async listReceivedInvitations(
    @Query() query: InvitationPageQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.sessionToken(authorization));
    return this.invitations.listReceivedInvitations(actor.accountId, query.limit, query.cursor);
  }

  @Post('contributor-invitations/:invitationPublicId/accept')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async acceptAccountInvitation(
    @Param('invitationPublicId', new ParseUUIDPipe({ version: '4' })) invitationPublicId: string,
    @Body() input: AcceptAccountAttributionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.sessionToken(authorization));
    return this.invitations.acceptAccountInvitation({
      ...input,
      actorAccountId: actor.accountId,
      invitationPublicId,
    });
  }

  @Post('contributor-invitations/:invitationPublicId/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async rejectAccountInvitation(
    @Param('invitationPublicId', new ParseUUIDPipe({ version: '4' })) invitationPublicId: string,
    @Body() input: InvitationTransitionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.sessionToken(authorization));
    return this.invitations.rejectAccountInvitation({
      ...input,
      actorAccountId: actor.accountId,
      invitationPublicId,
    });
  }

  @Post('contributor-invitations/:invitationPublicId/withdraw')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async withdrawAccountAttribution(
    @Param('invitationPublicId', new ParseUUIDPipe({ version: '4' })) invitationPublicId: string,
    @Body() input: InvitationTransitionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.sessionToken(authorization));
    return this.invitations.withdrawAccountAttribution({
      ...input,
      actorAccountId: actor.accountId,
      invitationPublicId,
    });
  }

  @Post('external-contributor-invitations/exchange')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async exchangeExternalToken(
    @Body() input: ExchangeExternalAttributionTokenDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const sessionToken = this.optionalSessionToken(authorization);
    const actor =
      sessionToken === null ? null : await this.auth.authorizeProfileAccess(sessionToken);
    return this.invitations.exchangeExternalToken(input.token, actor?.accountId);
  }

  @Post('external-contributor-recovery/exchange')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  exchangeExternalRecoveryCode(@Body() input: ExchangeExternalRecoveryCodeDto) {
    return this.invitations.exchangeExternalRecoveryCode(input.recoveryCode);
  }

  @Get('external-contributor-recovery/removal-request')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  getAttributionRemovalRequest(@Headers('authorization') authorization: string | undefined) {
    return this.attributionRemoval.findCurrent(this.sessionToken(authorization));
  }

  @Post('external-contributor-recovery/removal-requests')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  createAttributionRemovalRequest(
    @Body() input: CreateAttributionRemovalRequestDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.attributionRemoval.create({
      ...input,
      invitationSessionToken: this.sessionToken(authorization),
    });
  }

  @Post('external-contributor-invitations/accept')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  acceptExternalInvitation(
    @Body() input: AcceptExternalAttributionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.invitations.acceptExternalInvitation({
      ...input,
      invitationSessionToken: this.sessionToken(authorization),
    });
  }

  @Get('external-contributor-invitations/current')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  getExternalInvitation(@Headers('authorization') authorization: string | undefined) {
    return this.invitations.getExternalInvitation(this.sessionToken(authorization));
  }

  @Post('external-contributor-invitations/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  rejectExternalInvitation(
    @Body() input: InvitationTransitionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.invitations.rejectExternalInvitation({
      ...input,
      invitationSessionToken: this.sessionToken(authorization),
    });
  }

  private optionalSessionToken(authorization: string | undefined): string | null {
    if (authorization === undefined) return null;
    return this.sessionToken(authorization);
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
