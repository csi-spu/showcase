import { z } from 'zod';

const metricSchema = z
  .object({
    device: z.enum(['desktop', 'mobile']),
    name: z.enum(['CLS', 'INP', 'LCP']),
    page: z.enum([
      'home',
      'other',
      'people',
      'people_detail',
      'tag_detail',
      'work_detail',
      'works',
    ]),
    rating: z.enum(['good', 'needs-improvement', 'poor']),
    value: z.number().finite().nonnegative().max(120_000),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const parsed = metricSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success || (parsed.data.name === 'CLS' && parsed.data.value > 10)) {
    return Response.json(
      { error: { code: 'WEB_VITAL_INVALID' } },
      { headers: { 'Cache-Control': 'private, no-store' }, status: 400 },
    );
  }
  console.info(
    JSON.stringify({
      ...parsed.data,
      operation: 'public_web_vital_recorded',
    }),
  );
  return new Response(null, {
    headers: { 'Cache-Control': 'private, no-store' },
    status: 204,
  });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 1_024) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}
