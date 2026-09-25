import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { StudentCollectionAuthService } from '../../auth/application/student-collection-auth.service';
import { StudentCollectionBffGuard } from '../../auth/transport/student-collection-bff.guard';
import { CollectionFormsService } from '../application/collection-forms.service';
import {
  AttachCollectionFileDto,
  CreateCollectionUploadDto,
  SaveCollectionDraftDto,
  SubmitCollectionFormDto,
} from './collection-forms.dto';
import { CollectionFormsExceptionFilter } from './collection-forms-exception.filter';
import { toFileView, toObligationView, toSubmissionHistoryView } from './collection-forms.view';

@Controller('internal/student-collection/forms')
@UseFilters(CollectionFormsExceptionFilter)
@UseGuards(StudentCollectionBffGuard)
export class StudentCollectionFormsController {
  constructor(
    private readonly auth: StudentCollectionAuthService,
    private readonly forms: CollectionFormsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Headers('authorization') authorization: string | undefined) {
    const actor = await this.auth.authorizeRead(token(authorization));
    const obligations = await this.forms.listStudentObligations(actor.accountId);
    return obligations.map(toObligationView);
  }

  /** Values the system can fill in, returned separately so the Student can see and change them. */
  @Get(':formId/prefills')
  @Header('Cache-Control', 'no-store')
  async listPrefills(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeRead(token(authorization));
    return this.forms.listPrefills({ formId, studentAccountId: actor.accountId });
  }

  /**
   * Every version this Student has submitted for one form, with the decisions.
   *
   * Prior versions stay readable after a correction is requested, so the
   * Student can see what they sent before and why it came back.
   */
  @Get(':formId/history')
  @Header('Cache-Control', 'no-store')
  async history(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeRead(token(authorization));
    const history = await this.forms.getSubmissionHistory({
      actorAccountId: actor.accountId,
      formId,
      isInstructor: false,
      studentAccountId: actor.accountId,
    });
    return toSubmissionHistoryView(history);
  }

  @Post(':formId/draft')
  @Header('Cache-Control', 'no-store')
  async saveDraft(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: SaveCollectionDraftDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    return this.forms.saveDraft({ formId, studentAccountId: actor.accountId, ...body });
  }

  /**
   * Registers a pending upload slot. The browser must complete its signed PUT
   * and finalize the slot before inspection can claim it.
   */
  @Post(':formId/uploads')
  @Header('Cache-Control', 'no-store')
  async createUpload(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: CreateCollectionUploadDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    const { file, uploadUrl } = await this.forms.createUpload({
      formId,
      studentAccountId: actor.accountId,
      ...body,
    });
    return { file: toFileView(file), uploadUrl };
  }

  @Post(':formId/uploads/:fileId/retry')
  @Header('Cache-Control', 'no-store')
  async retryUpload(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    return this.forms.retryUpload({ fileId, formId, studentAccountId: actor.accountId });
  }

  @Post(':formId/uploads/:fileId/finalize')
  @Header('Cache-Control', 'no-store')
  async finalizeUpload(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    await this.forms.finalizeUpload({ fileId, formId, studentAccountId: actor.accountId });
    return { status: 'quarantined' };
  }

  /**
   * Issues a short-lived signed URL for one of the Student's own files.
   *
   * Collection documents are private: there is no public URL, and a file that
   * has not passed inspection is not downloadable.
   */
  @Get('files/:fileId/download')
  @Header('Cache-Control', 'no-store')
  async createDownload(
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeRead(token(authorization));
    return this.forms.createDownload({
      actorAccountId: actor.accountId,
      fileId,
      isInstructor: false,
    });
  }

  @Post(':formId/draft/files')
  @Header('Cache-Control', 'no-store')
  async attachFile(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: AttachCollectionFileDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    await this.forms.attachDraftFile({ formId, studentAccountId: actor.accountId, ...body });
    return { status: 'attached' };
  }

  @Delete(':formId/draft/files/:fileId')
  @Header('Cache-Control', 'no-store')
  async detachFile(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    await this.forms.detachDraftFile({ fileId, formId, studentAccountId: actor.accountId });
    return { status: 'detached' };
  }

  @Post(':formId/submit')
  @Header('Cache-Control', 'no-store')
  async submit(
    @Param('formId', new ParseUUIDPipe({ version: '4' })) formId: string,
    @Body() body: SubmitCollectionFormDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    return this.forms.submit(formId, actor.accountId, body.idempotencyKey);
  }
}

function token(authorization: string | undefined): string {
  const value = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (value.length === 0 || value.length > 512) throw new AuthError('UNAUTHENTICATED', 401);
  return value;
}
