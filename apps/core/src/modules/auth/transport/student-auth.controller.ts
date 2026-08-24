import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthError } from '../application/auth.error';
import {
  StudentAuthService,
  StudentSessionResult,
  StudentSessionStatusResult,
} from '../application/student-auth.service';
import { AuthExceptionFilter } from './auth-exception.filter';
import { StudentAuthCookieService } from './student-auth-cookie.service';
import { StudentChangePasswordDto, StudentLoginDto } from './student-auth.dto';
import { StudentOriginGuard } from './student-origin.guard';

@Controller('student/auth')
@UseFilters(AuthExceptionFilter)
export class StudentAuthController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly cookies: StudentAuthCookieService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(StudentOriginGuard)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() input: StudentLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StudentSessionStatusResult> {
    const result = await this.auth.login({
      password: input.password,
      sourceAddress: request.ip ?? request.socket.remoteAddress ?? 'unknown',
      studentId: input.studentId,
    });
    return this.setSession(response, result);
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() request: Request): Promise<StudentSessionStatusResult> {
    return this.auth.getSession(this.requireSessionToken(request));
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(StudentOriginGuard)
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @Body() input: StudentChangePasswordDto,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StudentSessionStatusResult> {
    const result = await this.auth.changePassword({
      csrfToken: this.requireCsrfToken(csrfToken),
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      sessionToken: this.requireSessionToken(request),
    });
    return this.setSession(response, result);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(StudentOriginGuard)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout({
      csrfToken: this.requireCsrfToken(csrfToken),
      sessionToken: this.requireSessionToken(request),
    });
    this.cookies.clear(response);
  }

  private requireCsrfToken(csrfToken: string | undefined): string {
    if (csrfToken === undefined || csrfToken.length === 0) {
      throw new AuthError('FORBIDDEN', 403);
    }
    return csrfToken;
  }

  private requireSessionToken(request: Request): string {
    const sessionToken = this.cookies.read(request);
    if (sessionToken === null) {
      throw new AuthError('UNAUTHENTICATED', 401);
    }
    return sessionToken;
  }

  private setSession(response: Response, result: StudentSessionResult): StudentSessionStatusResult {
    this.cookies.set(response, result.sessionToken);
    return {
      canUseStudentCapabilities: result.canUseStudentCapabilities,
      csrfToken: result.csrfToken,
      sessionState: result.sessionState,
    };
  }
}
