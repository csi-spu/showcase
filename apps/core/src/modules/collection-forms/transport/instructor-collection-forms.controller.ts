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
import { InstructorAuthService } from '../../auth/application/instructor-auth.service';
import { InstructorBffGuard } from '../../auth/transport/instructor-bff.guard';
import { CollectionFormsService } from '../application/collection-forms.service';
import { DEFAULT_REVIEW_PAGE_SIZE } from '../application/collection-review-queue';
import {
  CheckCollectionSubmissionDto,
  CollectionFieldAnswersParamsDto,
  CollectionFieldAnswersQueryDto,
  CollectionFormHistoryQueryDto,
  CollectionLifecycleReasonDto,
  CollectionMatrixQueryDto,
  CollectionReviewPositionQueryDto,
  CollectionReviewQueueQueryDto,
  CreateCollectionExportDto,
  CreateCollectionFormDto,
  CreateCollectionTemplateDto,
  CreateFormFromTemplateDto,
  SaveFormAsTemplateDto,
  SearchCollectionReviewQueueDto,
  UpdateCollectionFormDto,
  UpdateCollectionFormMetadataDto,
  UpdateCollectionTemplateDto,
} from './collection-forms.dto';
import { CollectionFormsExceptionFilter } from './collection-forms-exception.filter';
import {
  toExportView,
  toFieldAnswersView,
  toFormHistoryView,
  toInstructorFileView,
  toResponseSummaryView,
  toReviewPositionView,
  toReviewQueueView,
  toSubmissionHistoryView,
} from './collection-forms.view';

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

  /**
   * Saves details and questions as one change under optimistic form-version
   * concurrency. A body without details is the legacy questions-only save.
   */
  @Put('forms/:formId')
  @Header('Cache-Control', 'no-store')
  async update(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: UpdateCollectionFormDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    const { deadlineAt, description, expectedVersion, fields, title } = body;
    if (title === undefined || description === undefined || deadlineAt === undefined) {
      return this.forms.updateFormStructure({
        actorAccountId: actor.accountId,
        expectedVersion,
        fields,
        formId,
      });
    }
    return this.forms.saveForm({
      actorAccountId: actor.accountId,
      deadlineAt,
      description,
      expectedVersion,
      fields,
      formId,
      title,
    });
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

  /** The form's edit history, newest first, one save or lifecycle change per entry. */
  @Get('forms/:formId/history')
  @Header('Cache-Control', 'no-store')
  async formHistory(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Query() query: CollectionFormHistoryQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return toFormHistoryView(await this.forms.getFormHistory({ cursor: query.cursor, formId }));
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
    return toSubmissionHistoryView(history, toInstructorFileView);
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
   * One page of the review queue for one form.
   *
   * Returns submitted content only, so a Student's unsubmitted draft stays
   * private even from the Instructor who set the form.
   */
  @Get('forms/:formId/submissions')
  @Header('Cache-Control', 'no-store')
  async listSubmissions(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Query() query: CollectionReviewQueueQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    const queue = await this.forms.listFormSubmissions(toReviewQueueInput(formId, query, null));
    return toReviewQueueView(queue);
  }

  /**
   * One page of the review queue narrowed by a search.
   *
   * A POST so the term travels in the body: it may be a Student ID prefix,
   * which never appears in a URL or an access log (ADR 0020).
   */
  @Post('forms/:formId/submissions/search')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async searchSubmissions(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: SearchCollectionReviewQueueDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    const queue = await this.forms.listFormSubmissions(
      toReviewQueueInput(formId, body, body.search),
    );
    return toReviewQueueView(queue);
  }

  /** One Student's place in the review queue, for moving to the previous or next Student. */
  @Get('forms/:formId/students/:studentAccountId/review-position')
  @Header('Cache-Control', 'no-store')
  async readReviewPosition(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Param('studentAccountId', new ParseUUIDPipe({ version: '4' })) studentAccountId: string,
    @Query() query: CollectionReviewPositionQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    const position = await this.forms.readReviewPosition({
      formId,
      pageSize: query.pageSize ?? DEFAULT_REVIEW_PAGE_SIZE,
      sort: query.sort ?? 'status',
      status: query.status ?? null,
      studentAccountId,
    });
    return toReviewPositionView(position);
  }

  /**
   * The Summary view: totals and one anonymous aggregate per current question.
   *
   * Aggregated in Core over bounded SQL, so the browser never receives every
   * Student's answers to count them itself.
   */
  @Get('forms/:formId/responses/summary')
  @Header('Cache-Control', 'no-store')
  async responseSummary(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return toResponseSummaryView(await this.forms.readResponseSummary(formId));
  }

  /** One page of one current question's answers, for Summary or Question view. */
  @Get('forms/:formId/fields/:fieldId/answers')
  @Header('Cache-Control', 'no-store')
  async fieldAnswers(
    @Param() params: CollectionFieldAnswersParamsDto,
    @Query() query: CollectionFieldAnswersQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return toFieldAnswersView(
      await this.forms.readFieldAnswers({
        cursor: query.cursor,
        fieldId: params.fieldId,
        formId: params.formId,
        mode: query.mode,
      }),
    );
  }

  /**
   * Issues a short-lived signed URL to show one submitted image inline.
   *
   * Refused unless inspection detected a JPEG or PNG; every other file is
   * downloaded instead.
   */
  @Get('files/:fileId/preview')
  @Header('Cache-Control', 'no-store')
  async createPreview(
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    return this.forms.createPreview({ actorAccountId: actor.accountId, fileId });
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

  /**
   * Requests an export of selected forms in a group.
   *
   * Returns a pending job rather than bytes: the snapshot is frozen here and
   * the artifact is built by a worker, so an Instructor never holds an HTTP
   * request open for a group archive.
   */
  @Post('groups/:groupId/exports')
  @Header('Cache-Control', 'no-store')
  async createExport(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() body: CreateCollectionExportDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeInstructor(token(authorization));
    const job = await this.forms.createExport({
      formIds: body.formIds,
      groupId,
      kind: body.kind,
      requestedByAccountId: actor.accountId,
    });
    return toExportView(job);
  }

  /** One bounded page of a group's export history, newest first. */
  @Get('groups/:groupId/exports')
  @Header('Cache-Control', 'no-store')
  async listExports(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    const jobs = await this.forms.listGroupExports(groupId);
    return { exports: jobs.map(toExportView) };
  }

  /** One export's current state, for a status poll while it builds. */
  @Get('exports/:exportId')
  @Header('Cache-Control', 'no-store')
  async getExport(
    @Param('exportId', new ParseUUIDPipe({ version: '4' })) exportId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return toExportView(await this.forms.getExport(exportId));
  }

  /**
   * Issues a short-lived signed URL for a ready artifact.
   *
   * Authorization is rechecked here against the current actor even though the
   * exported data was frozen at creation: an Instructor whose role was
   * withdrawn since requesting the export must be denied, which is what
   * `authorizeInstructor` on this request does.
   */
  @Get('exports/:exportId/download')
  @Header('Cache-Control', 'no-store')
  async downloadExport(
    @Param('exportId', new ParseUUIDPipe({ version: '4' })) exportId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.auth.authorizeInstructor(token(authorization));
    return this.forms.createExportDownload({ exportId });
  }
}

function token(authorization: string | undefined): string {
  const value = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (value.length === 0 || value.length > 512) throw new AuthError('UNAUTHENTICATED', 401);
  return value;
}

function toReviewQueueInput(
  formId: string,
  query: CollectionReviewQueueQueryDto,
  search: string | null,
) {
  return {
    formId,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? DEFAULT_REVIEW_PAGE_SIZE,
    search,
    sort: query.sort ?? 'status',
    status: query.status ?? null,
  };
}
