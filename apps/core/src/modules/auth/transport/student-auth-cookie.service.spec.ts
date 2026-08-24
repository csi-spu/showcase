import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { StudentAuthCookieService } from './student-auth-cookie.service';

describe('StudentAuthCookieService', () => {
  it('uses a Secure host-only Student cookie in shared environments', () => {
    let cookieOptions: unknown;
    const cookie = jest.fn((_name: string, _value: string, options: unknown) => {
      cookieOptions = options;
    });
    const response = { cookie } as unknown as Response;
    const service = new StudentAuthCookieService(new ConfigService({ APP_ENV: 'staging' }));

    service.set(response, 'opaque-session-token');

    expect(cookie).toHaveBeenCalledWith(
      '__Host-showcase_student_session',
      'opaque-session-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: true,
      }),
    );
    expect(cookieOptions).not.toHaveProperty('domain');
  });
});
