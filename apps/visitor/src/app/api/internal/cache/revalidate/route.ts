import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

const requestSchema = z
  .object({
    tags: z
      .array(
        z
          .string()
          .regex(/^showcase-[a-z0-9-]+$/u)
          .max(1_024),
      )
      .min(1)
      .max(100),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get('authorization'))) {
    return Response.json(
      { error: { code: 'CACHE_REVALIDATION_UNAUTHORIZED' } },
      { headers: { 'Cache-Control': 'private, no-store' }, status: 401 },
    );
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'CACHE_REVALIDATION_INVALID' } },
      { headers: { 'Cache-Control': 'private, no-store' }, status: 400 },
    );
  }
  for (const tag of new Set(parsed.data.tags)) {
    revalidateTag(tag, { expire: 0 });
    revalidateTaggedPath(tag);
  }
  return new Response(null, {
    headers: { 'Cache-Control': 'private, no-store' },
    status: 204,
  });
}

function isAuthorized(authorization: string | null): boolean {
  const secret =
    process.env.VISITOR_CACHE_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? undefined
      : 'local-development-only-visitor-cache-secret');
  if (secret === undefined || authorization === null) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function revalidateTaggedPath(tag: string): void {
  if (tag === 'showcase-catalog') revalidatePath('/');
  if (tag === 'showcase-catalog-works') revalidatePath('/works');
  if (tag === 'showcase-catalog-people') revalidatePath('/people');
  if (tag === 'showcase-sitemap') {
    revalidatePath('/sitemap.xml');
    revalidatePath('/sitemaps/[kind]/[bucket]', 'page');
  }
  if (tag.startsWith('showcase-work-')) revalidatePath(`/works/${tag.slice(14)}`);
  if (tag.startsWith('showcase-profile-')) revalidatePath(`/people/${tag.slice(17)}`);
  if (tag.startsWith('showcase-tag-')) revalidatePath(`/tags/${tag.slice(13)}`);
}
