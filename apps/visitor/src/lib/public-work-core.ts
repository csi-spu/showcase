import 'server-only';
import { z } from 'zod';

const academicPeriodSchema = z
  .object({ semester: z.enum(['1', '2', 'summer']), year: z.number().int() })
  .strict();
const publicWorkSchema = z
  .object({
    academicPeriod: academicPeriodSchema,
    attributions: z
      .array(
        z
          .object({
            affiliation: z.string().nullable(),
            attributionName: z.string().min(1).max(100),
            contributionRole: z.string().nullable(),
            profilePublicId: z.uuid().nullable(),
            studyYear: z.number().int().min(1).max(8).nullable(),
          })
          .strict(),
      )
      .max(21),
    category: z.enum(['course_work', 'competition_entry', 'academic_article']),
    description: z.string().min(1).max(10_000),
    links: z.array(z.object({ label: z.string().min(1).max(50), url: z.url() }).strict()).max(5),
    media: z
      .array(
        z
          .object({
            assetId: z.uuid(),
            dominantColor: z.string().regex(/^#[0-9A-F]{6}$/),
            height: z.number().int().positive(),
            kind: z.enum(['poster', 'gallery']),
            position: z.number().int().min(1).max(3),
            variants: z
              .array(
                z
                  .object({
                    height: z.number().int().positive(),
                    width: z.number().int().positive(),
                  })
                  .strict(),
              )
              .min(1),
            width: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    publishedAt: z.iso.datetime(),
    revisionNumber: z.number().int().positive(),
    summary: z.string().min(1).max(300),
    tags: z
      .array(z.object({ displayLabel: z.string().min(1).max(50), publicId: z.uuid() }).strict())
      .max(5),
    title: z.string().min(1).max(150),
    videoLinks: z
      .array(
        z
          .object({
            provider: z.enum(['youtube', 'tiktok']),
            providerVideoId: z.string().min(1).max(255),
            url: z.url(),
          })
          .strict(),
      )
      .max(3),
    workPublicId: z.uuid(),
  })
  .strict();

const publicMediaSchema = z.object({ url: z.url() }).strict();

export type PublicWork = z.infer<typeof publicWorkSchema>;

export class PublicWorkCoreClient {
  private readonly coreOrigin: string;

  constructor(
    coreUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.coreOrigin = new URL(coreUrl).origin;
  }

  async getWork(publicId: string): Promise<PublicWork | null> {
    const response = await this.fetchImpl(
      new URL(`/v1/public/works/${encodeURIComponent(publicId)}`, this.coreOrigin).toString(),
      {
        credentials: 'omit',
        headers: { accept: 'application/json' },
        next: {
          revalidate: 60,
          tags: ['showcase-catalog', `showcase-work-${publicId}`],
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('PUBLIC_WORK_SERVICE_UNAVAILABLE');
    return publicWorkSchema.parse(await response.json());
  }

  async getMediaUrl(workPublicId: string, assetId: string, width: number): Promise<string | null> {
    const path = `/v1/public/works/${encodeURIComponent(workPublicId)}/media/${encodeURIComponent(assetId)}/variants/${width}`;
    const response = await this.fetchImpl(new URL(path, this.coreOrigin).toString(), {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('PUBLIC_WORK_MEDIA_SERVICE_UNAVAILABLE');
    return publicMediaSchema.parse(await response.json()).url;
  }
}
