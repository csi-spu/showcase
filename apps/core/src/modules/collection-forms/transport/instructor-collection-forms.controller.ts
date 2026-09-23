import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { InstructorAuthService } from '../../auth/application/instructor-auth.service';
import { InstructorBffGuard } from '../../auth/transport/instructor-bff.guard';
import { CollectionFormsService } from '../application/collection-forms.service';
import {
  CheckCollectionSubmissionDto,
  CollectionLifecycleReasonDto,
  CollectionMatrixQueryDto,
  CreateCollectionFormDto,
  CreateCollectionTemplateDto,
  CreateFormFromTemplateDto,
  SaveFormAsTemplateDto,
  UpdateCollectionFormDto,
  UpdateCollectionFormMetadataDto,
  UpdateCollectionTemplateDto,
} from './collection-forms.dto';
import { CollectionFormsExceptionFilter } from './collection-forms-exception.filter';
import { toSubmissionHistoryView } from './collection-forms.view';

@Controller('internal/instructor/collection')
@UseFilters(CollectionFormsExceptionFilter)
@UseGuards(InstructorBffGuard)
export class InstructorCollectionFormsController {
  constructor(
    private readonly auth: InstructorAuthService,
    private readonly forms: CollectionFormsService,
  ) {}

  @Post('groups/:groupId/forms')
  @Header('Cache-Control', 'no-store')
  async create(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() body: CreateCollectionFormDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.createForm({ actorAccountId: actor.accountId, groupId, ...body });
  }

  @Post('groups/:groupId/forms/from-template')
  @Header('Cache-Control', 'no-store')
  async createFromTemplate(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() body: CreateFormFromTemplateDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.createFormFromTemplate({
      actorAccountId: actor.accountId,
      groupId,
      ...body,
    });
  }

  @Get('groups/:groupId/forms')
  @Header('Cache-Control', 'no-store')
  async list(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.listGroupForms(groupId);
  }

  /** Replaces a Draft form's structure. Rejected once the form has been opened. */
  @Put('forms/:formId')
  @Header('Cache-Control', 'no-store')
  async update(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: UpdateCollectionFormDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.updateDraftForm({ actorAccountId: actor.accountId, formId, ...body });
  }

  @Put('forms/:formId/metadata')
  @Header('Cache-Control', 'no-store')
  async updateMetadata(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: UpdateCollectionFormMetadataDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.updateFormMetadata({ actorAccountId: actor.accountId, formId, ...body });
  }

  @Post('forms/:formId/open')
  @Header('Cache-Control', 'no-store')
  async open(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.openForm(actor.accountId, formId);
  }

  /**
   * Stops first submissions on an open form.
   *
   * Deliberately separate from closing the round: requested corrections and
   * checking continue on a closed form, so this ends new arrivals only.
   */
  @Post('forms/:formId/close')
  @Header('Cache-Control', 'no-store')
  async close(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: CollectionLifecycleReasonDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.closeForm({ actorAccountId: actor.accountId, formId, ...body });
  }

  /** How many obligations reopening would create, shown before confirming. */
  @Get('forms/:formId/reopen-preview')
  @Header('Cache-Control', 'no-store')
  async previewReopen(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.previewFormReopen(formId);
  }

  @Post('forms/:formId/reopen')
  @Header('Cache-Control', 'no-store')
  async reopen(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: CollectionLifecycleReasonDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.reopenForm({ actorAccountId: actor.accountId, formId, ...body });
  }

  /**
   * One page of the group's Student-by-form matrix.
   *
   * Bounded in both directions by Core: the page size is capped and the form
   * columns are capped, so a large group cannot turn this into an unbounded
   * read whatever the caller asks for.
   */
  @Get('groups/:groupId/matrix')
  @Header('Cache-Control', 'no-store')
  async matrix(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Query() query: CollectionMatrixQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.readGroupMatrix({
      afterStudentAccountId: query.after ?? null,
      groupId,
      limit: query.limit,
    });
  }

  /** Outstanding work the Instructor confirms against before closing a round. */
  @Get('rounds/:roundId/pending-work')
  @Header('Cache-Control', 'no-store')
  async pendingWork(
    @Param('roundId', new ParseUUIDPipe({ version: '4' })) roundId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.getRoundPendingWork(roundId);
  }

  @Post('rounds/:roundId/close')
  @Header('Cache-Control', 'no-store')
  async closeRound(
    @Param('roundId', new ParseUUIDPipe({ version: '4' })) roundId: string,
    @Body() body: CollectionLifecycleReasonDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.closeRound({ actorAccountId: actor.accountId, roundId, ...body });
  }

  @Post('rounds/:roundId/reopen')
  @Header('Cache-Control', 'no-store')
  async reopenRound(
    @Param('roundId', new ParseUUIDPipe({ version: '4' })) roundId: string,
    @Body() body: CollectionLifecycleReasonDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.reopenRound({ actorAccountId: actor.accountId, roundId, ...body });
  }

  /**
   * Every retained version of one Student's response, with its decisions.
   *
   * Reads submitted versions only. A Student's current draft is not history and
   * is never joined here.
   */
  @Get('forms/:formId/students/:studentAccountId/history')
  @Header('Cache-Control', 'no-store')
  async history(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Param('studentAccountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    const history = await this.forms.getSubmissionHistory({
      actorAccountId: actor.accountId,
      formId,
      isInstructor: true,
      studentAccountId,
    });
    return toSubmissionHistoryView(history);
  }

  @Post('forms/:formId/save-as-template')
  @Header('Cache-Control', 'no-store')
  async saveAsTemplate(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: SaveFormAsTemplateDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.saveFormAsTemplate({ actorAccountId: actor.accountId, formId, ...body });
  }

  @Get('templates')
  @Header('Cache-Control', 'no-store')
  async listTemplates(@Headers('authorization') authorization: string | undefined) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.listTemplates();
  }

  @Post('templates')
  @Header('Cache-Control', 'no-store')
  async createTemplate(
    @Body() body: CreateCollectionTemplateDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.createTemplate({ actorAccountId: actor.accountId, ...body });
  }

  @Put('templates/:templateId')
  @Header('Cache-Control', 'no-store')
  async updateTemplate(
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
    @Body() body: UpdateCollectionTemplateDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.updateTemplate({ templateId, ...body });
  }

  @Post('submissions/:submissionId/check')
  @Header('Cache-Control', 'no-store')
  async check(
    @Param('submissionId', new ParseUUIDPipe({ version: '4' })) submissionId: string,
    @Body() body: CheckCollectionSubmissionDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    await this.forms.checkSubmission({
      actorAccountId: actor.accountId,
      expectedSubmissionId: submissionId,
      ...body,
    });
    return { status: body.decision };
  }

  /**
   * The review queue for one form.
   *
   * Returns submitted content only, so a Student's unsubmitted draft stays
   * private even from the Instructor who set the form.
   */
  @Get('forms/:formId/submissions')
  @Header('Cache-Control', 'no-store')
  async listSubmissions(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.listFormSubmissions(formId);
  }

  /**
   * Issues a short-lived signed URL for a document attached to a submission.
   *
   * An Instructor can read submitted documents only. Draft selections stay
   * private to the Student, and the repository query is what enforces that.
   */
  @Get('files/:fileId/download')
  @Header('Cache-Control', 'no-store')
  async createDownload(
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.createDownload({
      actorAccountId: actor.accountId,
      fileId,
      isInstructor: true,
    });
  }
}

function token(authorization: string | undefined): string {
  const value = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (value.length === 0 || value.length > 512) throw new AuthError('UNAUTHENTICATED', 401);
  return value;
}
