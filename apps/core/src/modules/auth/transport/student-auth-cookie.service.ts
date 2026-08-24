import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

const STUDENT_COOKIE_MAX_AGE_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class StudentAuthCookieService {
  readonly cookieName: string;
  private readonly isSecure: boolean;

  constructor(config: ConfigService) {
    this.isSecure = ['production', 'staging'].includes(config.getOrThrow<string>('APP_ENV'));
    this.cookieName = this.isSecure
      ? '__Host-showcase_student_session'
      : 'showcase_student_session';
  }

  clear(response: Response): void {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.isSecure,
    });
  }

  read(request: Request): string | null {
    const cookieHeader = request.headers.cookie;
    if (cookieHeader === undefined) {
      return null;
    }

    for (const entry of cookieHeader.split(';')) {
      const separator = entry.indexOf('=');
      if (separator === -1 || entry.slice(0, separator).trim() !== this.cookieName) {
        continue;
      }
      const value = entry.slice(separator + 1).trim();
      return value.length > 0 ? value : null;
    }

    return null;
  }

  set(response: Response, sessionToken: string): void {
    response.cookie(this.cookieName, sessionToken, {
      httpOnly: true,
      maxAge: STUDENT_COOKIE_MAX_AGE_MILLISECONDS,
      path: '/',
      sameSite: 'lax',
      secure: this.isSecure,
    });
  }
}
