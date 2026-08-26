import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { PublicCacheInvalidator } from '../application/cache-invalidation.ports';

const cloudflareResponseSchema = z.object({ success: z.literal(true) }).passthrough();

export class PublicCacheInvalidationProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PublicCacheInvalidationProviderError';
  }
}

@Injectable()
export class CloudflarePublicCacheInvalidator implements PublicCacheInvalidator {
  private readonly cloudflareApiToken: string;
  private readonly cloudflareZoneId: string;
  private readonly visitorCacheSecret: string;
  private readonly visitorOrigin: string;

  constructor(config: ConfigService) {
    this.cloudflareApiToken = config.getOrThrow<string>('CLOUDFLARE_API_TOKEN');
    this.cloudflareZoneId = config.getOrThrow<string>('CLOUDFLARE_ZONE_ID');
    this.visitorCacheSecret = config.getOrThrow<string>('VISITOR_CACHE_SECRET');
    this.visitorOrigin = new URL(config.getOrThrow<string>('VISITOR_URL')).origin;
  }

  async invalidate(tags: string[]): Promise<void> {
    const visitor = await fetch(`${this.visitorOrigin}/api/internal/cache/revalidate`, {
      body: JSON.stringify({ tags }),
      headers: {
        authorization: `Bearer ${this.visitorCacheSecret}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
    if (!visitor.ok) {
      throw new PublicCacheInvalidationProviderError('VISITOR_CACHE_REVALIDATION_FAILED');
    }

    const cloudflare = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.cloudflareZoneId)}/purge_cache`,
      {
        body: JSON.stringify({ tags }),
        headers: {
          authorization: `Bearer ${this.cloudflareApiToken}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!cloudflare.ok) {
      throw new PublicCacheInvalidationProviderError('CLOUDFLARE_CACHE_PURGE_FAILED');
    }
    try {
      cloudflareResponseSchema.parse(await cloudflare.json());
    } catch {
      throw new PublicCacheInvalidationProviderError('CLOUDFLARE_CACHE_PURGE_REJECTED');
    }
  }
}
