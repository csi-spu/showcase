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
  StudentAuthService,
  StudentSessionResult,
  StudentSessionStatusResult,
} from '../application/student-auth.service';
import { AuthExceptionFilter } from './auth-exception.filter';
import { StudentBffGuard } from './student-bff.guard';
import { StudentChangePasswordDto, StudentLoginDto } from './student-auth.dto';

@Controller('internal/student/auth')
@UseFilters(AuthExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentAuthController {
  constructor(private readonly auth: StudentAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() input: StudentLoginDto,
    @Headers('x-client-address') sourceAddress: string | undefined,
  ): Promise<StudentSessionResult> {
    return this.auth.login({
      password: input.password,
      sourceAddress: this.normalizeSourceAddress(sourceAddress),
      studentId: input.studentId,
    });
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StudentSessionStatusResult> {
    return this.auth.getSession(this.requireSessionToken(authorization));
  }

  @Post('change-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @Body() input: StudentChangePasswordDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StudentSessionResult> {
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
    await this.auth.logout({
      sessionToken: this.requireSessionToken(authorization),
    });
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
