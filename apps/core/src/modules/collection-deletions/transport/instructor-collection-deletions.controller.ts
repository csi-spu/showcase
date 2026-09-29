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
import { AuthError } from '../../auth/application/auth.error';
import { InstructorAuthService } from '../../auth/application/instructor-auth.service';
import { InstructorBffGuard } from '../../auth/transport/instructor-bff.guard';
import { CollectionDeletionsService } from '../application/collection-deletions.service';
import type {
  CollectionDeletionLogPage,
  CollectionDeletionPreview,
  CollectionDeletionTarget,
} from '../application/collection-deletions.ports';
import {
  CollectionDeletionLogQueryDto,
  DeleteCollectionItemDto,
  RestoreCollectionDeletionDto,
} from './collection-deletions.dto';
import { CollectionDeletionsExceptionFilter } from './collection-deletions-exception.filter';

const UUID_V4 = new ParseUUIDPipe({ version: '4' });

@Controller('internal/instructor/collection')
@UseFilters(CollectionDeletionsExceptionFilter)
@UseGuards(InstructorBffGuard)
export class InstructorCollectionDeletionsController {
  constructor(
    private readonly auth: InstructorAuthService,
    private readonly deletions: CollectionDeletionsService,
  ) {}

  @Get('rounds/:roundId/deletion-preview')
  @Header('Cache-Control', 'no-store')
  async previewRound(
    @Param('roundId', UUID_V4) roundId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionDeletionPreview> {
    return this.preview({ id: roundId, kind: 'round' }, authorization);
  }

  @Get('groups/:groupId/deletion-preview')
  @Header('Cache-Control', 'no-store')
  async previewGroup(
    @Param('groupId', UUID_V4) groupId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionDeletionPreview> {
    return this.preview({ id: groupId, kind: 'group' }, authorization);
  }

  @Get('forms/:formId/deletion-preview')
  @Header('Cache-Control', 'no-store')
  async previewForm(
    @Param('formId', UUID_V4) formId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionDeletionPreview> {
    return this.preview({ id: formId, kind: 'form' }, authorization);
  }

  @Post('rounds/:roundId/delete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deleteRound(
    @Param('roundId', UUID_V4) roundId: string,
    @Body() body: DeleteCollectionItemDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ deletionId: string }> {
    return this.delete({ id: roundId, kind: 'round' }, body, authorization);
  }

  @Post('groups/:groupId/delete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deleteGroup(
    @Param('groupId', UUID_V4) groupId: string,
    @Body() body: DeleteCollectionItemDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ deletionId: string }> {
    return this.delete({ id: groupId, kind: 'group' }, body, authorization);
  }

  @Post('forms/:formId/delete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deleteForm(
    @Param('formId', UUID_V4) formId: string,
    @Body() body: DeleteCollectionItemDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ deletionId: string }> {
    return this.delete({ id: formId, kind: 'form' }, body, authorization);
  }

  /** Every deletion, newest first, with who restored it and whether it can be restored now. */
  @Get('deletions')
  @Header('Cache-Control', 'no-store')
  async listDeletions(
    @Query() query: CollectionDeletionLogQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CollectionDeletionLogPage> {
    await this.authorize(authorization);
    return this.deletions.listDeletions({ cursor: query.cursor });
  }

  @Post('deletions/:deletionId/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async restore(
    @Param('deletionId', UUID_V4) deletionId: string,
    @Body() body: RestoreCollectionDeletionDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ deletionId: string }> {
    const actor = await this.authorize(authorization);
    return this.deletions.restoreDeletion({
      actorAccountId: actor.accountId,
      deletionId,
      reason: body.reason,
    });
  }

  private async preview(
    target: CollectionDeletionTarget,
    authorization: string | undefined,
  ): Promise<CollectionDeletionPreview> {
    await this.authorize(authorization);
    return this.deletions.previewDeletion(target);
  }

  private async delete(
    target: CollectionDeletionTarget,
    body: DeleteCollectionItemDto,
    authorization: string | undefined,
  ): Promise<{ deletionId: string }> {
    const actor = await this.authorize(authorization);
    return this.deletions.deleteItem({
      actorAccountId: actor.accountId,
      confirmationName: body.confirmationName,
      target,
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
