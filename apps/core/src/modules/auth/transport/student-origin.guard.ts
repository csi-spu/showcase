import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthError } from '../application/auth.error';

@Injectable()
export class StudentOriginGuard implements CanActivate {
  private readonly studentOrigin: string;

  constructor(config: ConfigService) {
    this.studentOrigin = config.getOrThrow<string>('STUDENT_ORIGIN');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.origin !== this.studentOrigin) {
      throw new AuthError('FORBIDDEN', 403);
    }
    return true;
  }
}
