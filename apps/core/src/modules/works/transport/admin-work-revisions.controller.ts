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
import { WorkRevisionsService } from '../application/work-revisions.service';
import { ReviewsService } from '../application/reviews.service';
import { RequestChangesDto, ReviewQueueQueryDto } from './work-revisions.dto';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('internal/admin')
@UseFilters(WorksExceptionFilter)
@UseGuards(AdminBffGuard)
export class AdminWorkRevisionsController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly revisions: WorkRevisionsService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('review-queue')
  @Header('Cache-Control', 'no-store')
  async listReviewQueue(
    @Query() query: ReviewQueueQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    return this.revisions.listReviewQueue(query.limit, query.cursor);
  }

  @Get('revisions/:revisionPublicId')
  @Header('Cache-Control', 'no-store')
  async getRevision(
    @Param('revisionPublicId', new ParseUUIDPipe({ version: '4' })) revisionPublicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    const revision = await this.revisions.getRevisionForReview(revisionPublicId);
    return {
      ...revision,
      media: await Promise.all(
        revision.media.map(async (media) => {
          const preview = await this.reviews.getRevisionMediaPreview(
            revisionPublicId,
            media.assetId,
          );
          return {
            ...media,
            preview: { expiresAt: preview.expiresAt, url: preview.url },
          };
        }),
      ),
    };
  }

  @Post('revisions/:revisionPublicId/change-request')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async requestChanges(
    @Param('revisionPublicId', new ParseUUIDPipe({ version: '4' })) revisionPublicId: string,
    @Body() input: RequestChangesDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeAdmin(this.requireSessionToken(authorization));
    return this.reviews.requestChanges({
      ...input,
      actorAccountId: actor.accountId,
      revisionPublicId,
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
