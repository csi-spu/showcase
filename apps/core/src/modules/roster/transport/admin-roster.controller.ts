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
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminAuthService } from '../../auth/application/admin-auth.service';
import { AuthError } from '../../auth/application/auth.error';
import { AdminBffGuard } from '../../auth/transport/admin-bff.guard';
import { RosterImportError, RosterImportService } from '../application/roster-import.service';
import type {
  RosterBatch,
  RosterConflict,
  RosterConflictPage,
  RosterRowErrorPage,
} from '../application/roster.ports';
import { ListRosterConflictsQuery, ResolveRosterConflictDto } from './roster-conflict.dto';
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

  @Get(':batchId/errors.csv')
  async downloadErrorCsv(
    @Param('batchId', new ParseUUIDPipe({ version: '4' })) batchId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    const csv = await this.roster.getErrorCsv(batchId);
    response
      .status(200)
      .set({
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="roster-batch-${batchId}-errors.csv"`,
        'Content-Type': 'text/csv; charset=utf-8',
      })
      .send(csv);
  }

  @Get(':batchId/conflicts')
  @Header('Cache-Control', 'no-store')
  async listConflicts(
    @Param('batchId', new ParseUUIDPipe({ version: '4' })) batchId: string,
    @Query() query: ListRosterConflictsQuery,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<RosterConflictPage> {
    await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    return this.roster.listConflicts({
      afterRowNumber: query.afterRowNumber ?? null,
      batchId,
      limit: Math.min(query.limit ?? 50, 100),
    });
  }

  @Get(':batchId/row-errors')
  @Header('Cache-Control', 'no-store')
  async listErrorRows(
    @Param('batchId', new ParseUUIDPipe({ version: '4' })) batchId: string,
    @Query() query: ListRosterConflictsQuery,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<RosterRowErrorPage> {
    await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    return this.roster.listErrorRows({
      afterRowNumber: query.afterRowNumber ?? null,
      batchId,
      limit: Math.min(query.limit ?? 50, 100),
    });
  }

  @Post('conflicts/:conflictId/resolution')
  @Header('Cache-Control', 'no-store')
  async resolveConflict(
    @Param('conflictId', new ParseUUIDPipe({ version: '4' })) conflictId: string,
    @Body() body: ResolveRosterConflictDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<RosterConflict> {
    const actor = await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    return this.roster.resolveConflict({
      actorAccountId: actor.accountId,
      conflictId,
      expectedVersion: body.expectedVersion,
      idempotencyKey: body.idempotencyKey,
      ...(body.reason === undefined ? {} : { reason: body.reason }),
      resolution: body.resolution,
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
