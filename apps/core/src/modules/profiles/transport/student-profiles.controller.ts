import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { StudentAuthService } from '../../auth/application/student-auth.service';
import { StudentBffGuard } from '../../auth/transport/student-bff.guard';
import { ProfilePhotoService } from '../application/profile-photo.service';
import { ProfilesService } from '../application/profiles.service';
import {
  CreateProfilePhotoUploadDto,
  GrantProfileConsentDto,
  UpdateProfileDto,
  WithdrawProfileConsentDto,
} from './profiles.dto';
import { ProfilesExceptionFilter } from './profiles-exception.filter';

@Controller('internal/student/profile')
@UseFilters(ProfilesExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentProfilesController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly photos: ProfilePhotoService,
    private readonly profiles: ProfilesService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getProfile(@Headers('authorization') authorization: string | undefined) {
    const actor = await this.auth.authorizeProfileAccess(this.requireSessionToken(authorization));
    const state = await this.profiles.getPrivateProfile(actor.accountId);
    return {
      canEditProfile: actor.canEditProfile,
      person:
        state === null
          ? null
          : {
              entryYear: state.entryYear,
              firstName: state.firstName,
              lastName: state.lastName,
            },
      profile: state?.profile ?? null,
    };
  }

  @Post('photo-uploads')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async createPhotoUpload(
    @Body() input: CreateProfilePhotoUploadDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.requireSessionToken(authorization));
    return this.photos.createUpload({
      ...input,
      actorAccountId: actor.accountId,
      canEditProfile: actor.canEditProfile,
    });
  }

  @Post('photo-uploads/:uploadId/finalize')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async finalizePhotoUpload(
    @Param('uploadId', new ParseUUIDPipe({ version: '4' })) uploadId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.requireSessionToken(authorization));
    return this.photos.finalizeUpload({
      actorAccountId: actor.accountId,
      canEditProfile: actor.canEditProfile,
      uploadId,
    });
  }

  @Put()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async updateProfile(
    @Body() input: UpdateProfileDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.requireSessionToken(authorization));
    return this.profiles.updateProfile({
      ...input,
      actorAccountId: actor.accountId,
      canEditProfile: actor.canEditProfile,
    });
  }

  @Post('consent')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async grantConsent(
    @Body() input: GrantProfileConsentDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.requireSessionToken(authorization));
    return this.profiles.grantConsent({ ...input, actorAccountId: actor.accountId });
  }

  @Delete('consent')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async withdrawConsent(
    @Body() input: WithdrawProfileConsentDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeProfileAccess(this.requireSessionToken(authorization));
    return this.profiles.withdrawConsent({ ...input, actorAccountId: actor.accountId });
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
