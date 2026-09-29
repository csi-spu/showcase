/*
 * Streams one submitted JPEG or PNG image so the review page can show it.
 *
 * Mirrors the download route -- Core authorizes the file, this proxies the
 * bytes, and the signed storage URL never reaches the browser -- but serves the
 * image inline. Core only issues a preview for a file inspection detected as
 * one of those two types, and that detected type is what is sent: never the
 * Student's declared one. `nosniff` and a CSP that allows nothing keep the
 * browser from treating the bytes as anything but that image.
 */

import { CoreClientError } from '@showcase/core-client';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import {
  InstructorCollectionFormsCoreClient,
  type InstructorPreviewTicket,
} from '@/lib/instructor-collection-forms-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';

/* Matches the per-file ceiling Core enforces, so a larger body is a fault. */
const MAX_IMAGE_BYTES = 10_000_000;
const PRIVATE_CACHE_CONTROL = 'private, no-store';
/* The page falls back to the download link for any of these. */
const NOT_FOUND_CODES = ['FILE_NOT_FOUND', 'FILE_NOT_READY', 'FILE_NOT_PREVIEWABLE'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const { fileId } = await params;
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) return unauthenticated();

  let ticket: InstructorPreviewTicket;
  try {
    ticket = await new InstructorCollectionFormsCoreClient(
      getInstructorServerEnvironment(),
    ).createPreview(sessionToken, fileId);
  } catch (error: unknown) {
    if (
      error instanceof CoreClientError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      return unauthenticated();
    }
    if (error instanceof CoreClientError && NOT_FOUND_CODES.includes(error.code)) return notFound();
    throw error;
  }

  const upstream = await fetch(ticket.previewUrl, {
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
  });
  if (!upstream.ok || upstream.body === null) return notFound();
  const declaredLength = Number(upstream.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) return notFound();

  return new Response(upstream.body, {
    headers: {
      'Cache-Control': PRIVATE_CACHE_CONTROL,
      'Content-Security-Policy': "default-src 'none'",
      'Content-Type': ticket.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function notFound(): Response {
  return Response.json({ error: { code: 'FILE_NOT_FOUND' } }, { status: 404 });
}

function unauthenticated(): Response {
  return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
}
