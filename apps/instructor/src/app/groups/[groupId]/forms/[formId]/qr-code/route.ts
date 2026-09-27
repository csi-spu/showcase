/*
 * Serves the QR code of one form's Student link as a PNG download.
 *
 * The form is resolved through Core on every request, so an expired session,
 * a form outside the group, or a Draft no Student can open yet never yields an
 * image. The PNG is generated here rather than embedded in the page payload.
 */

import { CoreClientError } from '@showcase/core-client';
import { buildStudentFormLink, qrCodeFilename, renderQrCodePng } from '@/lib/form-share';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import type { InstructorCollectionForm } from '@/lib/instructor-collection-forms-contract';
import { getInstructorServerEnvironment } from '@/lib/server-environment';

const PRIVATE_CACHE_CONTROL = 'private, no-store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ formId: string; groupId: string }> },
): Promise<Response> {
  const { formId, groupId } = await params;
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) return unauthenticated();

  const environment = getInstructorServerEnvironment();
  let forms: InstructorCollectionForm[];
  try {
    forms = await new InstructorCollectionFormsCoreClient(environment).list(sessionToken, groupId);
  } catch (error: unknown) {
    if (
      error instanceof CoreClientError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      return unauthenticated();
    }
    if (error instanceof CoreClientError && error.code === 'GROUP_NOT_FOUND') return notFound();
    throw error;
  }

  const form = forms.find((candidate) => candidate.id === formId);
  if (form === undefined || form.status === 'draft') return notFound();

  const png = await renderQrCodePng(
    buildStudentFormLink(environment.studentCollectionUrl, form.id),
  );
  return new Response(new Uint8Array(png), {
    headers: {
      'Cache-Control': PRIVATE_CACHE_CONTROL,
      'Content-Disposition': contentDisposition(qrCodeFilename(form.title, form.id), form.id),
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Builds a `Content-Disposition` that survives a Thai form title.
 *
 * The form ID is the ASCII fallback because a Thai title would reduce to
 * nothing but placeholders; `filename*` carries the real name, with the
 * characters `encodeURIComponent` leaves but RFC 5987 forbids escaped too.
 */
function contentDisposition(filename: string, formId: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="qr-${formId}.png"; filename*=UTF-8''${encoded}`;
}

function notFound(): Response {
  return Response.json({ error: { code: 'FORM_NOT_FOUND' } }, { status: 404 });
}

function unauthenticated(): Response {
  return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
}
