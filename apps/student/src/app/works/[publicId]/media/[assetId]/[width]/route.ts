import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { StudentWorksCoreClient } from '@/lib/student-works-core';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string; publicId: string; width: string }> },
) {
  const parsed = z
    .object({
      assetId: z.uuid(),
      publicId: z.uuid(),
      width: z.coerce.number().int().positive().max(2_560),
    })
    .safeParse(await params);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const token = await readStudentSessionToken();
  if (token === null) return new NextResponse(null, { status: 401 });
  try {
    const media = await new StudentWorksCoreClient(
      getStudentServerEnvironment(),
    ).getPrivateMediaVariant(token, parsed.data.publicId, parsed.data.assetId, parsed.data.width);
    const response = NextResponse.redirect(media.url, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
