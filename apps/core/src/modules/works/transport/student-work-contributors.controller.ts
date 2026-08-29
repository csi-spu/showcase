import {
  Body,
  Controller,
  Delete,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { StudentAuthService } from '../../auth/application/student-auth.service';
import { StudentBffGuard } from '../../auth/transport/student-bff.guard';
import { WorkContributorsService } from '../application/work-contributors.service';
import {
  AddAccountContributorDto,
  AddExternalContributorDto,
  ContributorSearchDto,
  RemoveContributorDto,
} from './work-contributors.dto';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('internal/student/works/:workPublicId')
@UseFilters(WorksExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentWorkContributorsController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly contributors: WorkContributorsService,
  ) {}

  @Post('contributor-candidates/search')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async search(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Body() input: ContributorSearchDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.contributors.search({
      actorAccountId: actor.accountId,
      query: input.query,
      sourceAddress: `student-account:${actor.accountId}`,
      workPublicId,
    });
  }

  @Post('contributors/account')
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  async addAccount(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Body() input: AddAccountContributorDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.contributors.addAccount({
      ...input,
      actorAccountId: actor.accountId,
      workPublicId,
    });
  }

  @Post('contributors/external')
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  async addExternal(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Body() input: AddExternalContributorDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.contributors.addExternal({
      ...input,
      actorAccountId: actor.accountId,
      workPublicId,
    });
  }

  @Delete('contributors/:contributorPublicId')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async remove(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Param('contributorPublicId', new ParseUUIDPipe({ version: '4' })) contributorPublicId: string,
    @Body() input: RemoveContributorDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentMutation(this.sessionToken(authorization));
    return this.contributors.remove({
      ...input,
      actorAccountId: actor.accountId,
      contributorPublicId,
      workPublicId,
    });
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
