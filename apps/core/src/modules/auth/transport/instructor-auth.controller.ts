import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../application/auth.error';
import {
  InstructorAuthService,
  InstructorSessionResult,
  InstructorSessionStatusResult,
} from '../application/instructor-auth.service';
import { InstructorChangePasswordDto, InstructorLoginDto } from './instructor-auth.dto';
import { InstructorBffGuard } from './instructor-bff.guard';
import { AuthExceptionFilter } from './auth-exception.filter';

@Controller('internal/instructor/auth')
@UseFilters(AuthExceptionFilter)
@UseGuards(InstructorBffGuard)
export class InstructorAuthController {
  constructor(private readonly auth: InstructorAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(
    @Body() input: InstructorLoginDto,
    @Headers('x-client-address') sourceAddress: string | undefined,
  ): Promise<InstructorSessionResult> {
    return this.auth.login({
      instructorLogin: input.instructorLogin,
      password: input.password,
      sourceAddress: this.normalizeSourceAddress(sourceAddress),
    });
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  session(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<InstructorSessionStatusResult> {
    return this.auth.getSession(this.requireSessionToken(authorization));
  }

  @Post('change-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  changePassword(
    @Body() input: InstructorChangePasswordDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<InstructorSessionResult> {
    return this.auth.changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      sessionToken: this.requireSessionToken(authorization),
    });
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(@Headers('authorization') authorization: string | undefined): Promise<void> {
    await this.auth.logout({ sessionToken: this.requireSessionToken(authorization) });
  }

  private normalizeSourceAddress(sourceAddress: string | undefined): string {
    const normalized = sourceAddress?.trim();
    return normalized !== undefined && normalized.length > 0 && normalized.length <= 128
      ? normalized
      : 'unknown';
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
