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
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { StudentAuthService } from '../../auth/application/student-auth.service';
import { StudentBffGuard } from '../../auth/transport/student-bff.guard';
import { WorksService } from '../application/works.service';
import { WorkMediaService } from '../application/work-media.service';
import {
  AttachWorkMediaDto,
  CreateWorkDto,
  CreateWorkMediaUploadDto,
  RebaseWorkDraftDto,
  SeedPublishedWorkDraftDto,
  UpdateWorkDraftDto,
  WorkListQueryDto,
} from './works.dto';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('internal/student/works')
@UseFilters(WorksExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentWorksController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly works: WorksService,
    private readonly media: WorkMediaService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async listWorks(
    @Query() query: WorkListQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentRead(this.requireSessionToken(authorization));
    return this.works.listOwnedWorks({
      accountId: actor.accountId,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
    });
  }

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async createWork(
    @Body() input: CreateWorkDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.works.createWork({ ...input, actorAccountId: actor.accountId });
  }

  @Get('authoring-context')
  @Header('Cache-Control', 'no-store')
  async getAuthoringContext(@Headers('authorization') authorization: string | undefined) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.works.getAuthoringContext(actor.accountId);
  }

  @Get(':publicId')
  @Header('Cache-Control', 'no-store')
  async getDraft(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.works.getDraft(actor.accountId, publicId);
  }

  @Get(':publicId/authoring-state')
  @Header('Cache-Control', 'no-store')
  async getAuthoringState(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.works.getAuthoringState(actor.accountId, publicId);
  }

  @Post(':publicId/draft')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async seedPublishedDraft(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Body() input: SeedPublishedWorkDraftDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.works.seedPublishedDraft({ ...input, actorAccountId: actor.accountId, publicId });
  }

  @Post(':publicId/draft/rebase')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async rebaseDraft(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Body() input: RebaseWorkDraftDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.works.rebaseDraft({ ...input, actorAccountId: actor.accountId, publicId });
  }

  @Put(':publicId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async updateDraft(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Body() input: UpdateWorkDraftDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.works.updateDraft({ ...input, actorAccountId: actor.accountId, publicId });
  }

  @Post(':publicId/media-uploads')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async createMediaUpload(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Body() input: CreateWorkMediaUploadDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.media.authorizeUpload({ ...input, actorAccountId: actor.accountId, publicId });
  }

  @Post(':publicId/media-uploads/:assetId/finalize')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async finalizeMediaUpload(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Param('assetId', new ParseUUIDPipe({ version: '4' })) assetId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.media.finalizeUpload({ actorAccountId: actor.accountId, assetId, publicId });
  }

  @Get(':publicId/media-uploads/:assetId')
  @Header('Cache-Control', 'no-store')
  async getMediaUploadStatus(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Param('assetId', new ParseUUIDPipe({ version: '4' })) assetId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.media.getUploadStatus({ actorAccountId: actor.accountId, assetId, publicId });
  }

  @Put(':publicId/media')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async attachMedia(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Body() input: AttachWorkMediaDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.requireSessionToken(authorization));
    return this.media.attachReadyMedia({ ...input, actorAccountId: actor.accountId, publicId });
  }

  private requireSessionToken(authorization: string | undefined): string {
    const prefix = 'Bearer ';
    const sessionToken = authorization?.startsWith(prefix)
      ? authorization.slice(prefix.length).trim()
      : '';
    if (sessionToken.length === 0 || sessionToken.length > 512) {
      throw new AuthError('UNAUTHENTICATED', 401);
    }
    return sessionToken;
  }
}
