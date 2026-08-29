import { z } from 'zod';
import { getStudentServerEnvironment } from '@/lib/server-environment';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await params;
  if (!z.uuid().safeParse(publicId).success) {
    return Response.json({ error: { code: 'PUBLIC_PROFILE_NOT_FOUND' } }, { status: 404 });
  }
  const photoUrl = new URL(`/people/${publicId}/photo`, getStudentServerEnvironment().visitorUrl);
  return Response.redirect(photoUrl, 307);
}
