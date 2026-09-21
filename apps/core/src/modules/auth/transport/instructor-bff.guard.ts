import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { AuthError } from '../application/auth.error';

@Injectable()
export class InstructorBffGuard implements CanActivate {
  private readonly expectedDigest: Buffer;

  constructor(config: ConfigService) {
    this.expectedDigest = this.digest(config.getOrThrow<string>('INSTRUCTOR_BFF_SECRET'));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-instructor-bff-secret'];
    const value = typeof provided === 'string' ? provided : '';
    if (!timingSafeEqual(this.expectedDigest, this.digest(value))) {
      throw new AuthError('FORBIDDEN', 403);
    }
    return true;
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
}
