import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class VisitorCacheGuard implements CanActivate {
  private readonly expectedDigest: Buffer;

  constructor(config: ConfigService) {
    this.expectedDigest = digest(config.getOrThrow<string>('VISITOR_CACHE_SECRET'));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-visitor-cache-secret'];
    const value = typeof provided === 'string' ? provided : '';
    if (!timingSafeEqual(this.expectedDigest, digest(value))) throw new ForbiddenException();
    return true;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
