import 'server-only';
import { z } from 'zod';

const publicProfileSchema = z
  .object({
    bio: z.string().nullable(),
    entryYear: z.number().int(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    links: z.array(z.object({ label: z.string(), url: z.url() }).strict()).max(5),
    photo: z
      .object({
        height: z.number().int().min(512).max(4_096),
        url: z.url(),
        width: z.number().int().min(512).max(4_096),
      })
      .strict()
      .nullable(),
    publicId: z.uuid(),
  })
  .strict();

export type PublicProfile = z.infer<typeof publicProfileSchema>;

export class PublicProfileCoreClient {
  private readonly coreOrigin: string;

  constructor(
    coreUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.coreOrigin = new URL(coreUrl).origin;
  }

  async getProfile(publicId: string): Promise<PublicProfile | null> {
    const url = new URL(`/v1/public/profiles/${encodeURIComponent(publicId)}`, this.coreOrigin);
    const response = await this.fetchImpl(url.toString(), {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('PUBLIC_PROFILE_SERVICE_UNAVAILABLE');
    return publicProfileSchema.parse(await response.json());
  }
}

export function getVisitorCoreUrl(): string {
  const value =
    process.env.CORE_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4100');
  if (value === undefined) throw new Error('CORE_URL_NOT_CONFIGURED');
  return new URL(value).origin;
}

export function getVisitorBffSecret(): string {
  const value =
    process.env.VISITOR_BFF_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? undefined
      : 'local-development-only-visitor-bff-secret');
  if (value === undefined || value.length < 32)
    throw new Error('VISITOR_BFF_SECRET_NOT_CONFIGURED');
  return value;
}
