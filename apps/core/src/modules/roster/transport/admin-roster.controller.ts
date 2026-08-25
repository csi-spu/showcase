import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from '../../auth/application/admin-auth.service';
import { AuthError } from '../../auth/application/auth.error';
import { AdminBffGuard } from '../../auth/transport/admin-bff.guard';
import { RosterImportError, RosterImportService } from '../application/roster-import.service';
import type { RosterBatch } from '../application/roster.ports';
import { RosterExceptionFilter } from './roster-exception.filter';

@Controller('internal/admin/roster-batches')
@UseFilters(RosterExceptionFilter)
@UseGuards(AdminBffGuard)
export class AdminRosterController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly roster: RosterImportService,
  ) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async createBatch(
    @Req() request: Request,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<RosterBatch> {
    const actor = await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    const content = request.body as unknown;
    if (!Buffer.isBuffer(content)) {
      throw new RosterImportError('INVALID_ROSTER_CSV', 422);
    }
    return this.roster.createBatch({
      actorAccountId: actor.accountId,
      content,
    });
  }

  @Get(':batchId')
  @Header('Cache-Control', 'no-store')
  async getBatch(
    @Param('batchId', new ParseUUIDPipe({ version: '4' })) batchId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<RosterBatch> {
    await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    return this.roster.getBatch(batchId);
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
