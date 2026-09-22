/*
 * Streams one of the Student's own documents back to them.
 *
 * The signed storage URL never reaches the browser: Core authorizes the file
 * against the Student who owns it, this proxies the bytes, and the response is
 * private and never cached. A file that has not passed inspection is refused by
 * Core, not by this handler.
 */

import { CoreClientError } from '@showcase/core-client';
import { readStudentCollectionSessionToken } from '@/lib/student-collection-auth-session';
import { StudentCollectionFormsCoreClient } from '@/lib/student-collection-forms-core';
import { getStudentCollectionServerEnvironment } from '@/lib/server-environment';

/* Matches the per-file ceiling Core enforces, so a larger body is a fault. */
const MAX_DOCUMENT_BYTES = 10_000_000;
const PRIVATE_CACHE_CONTROL = 'private, no-store';
const NOT_FOUND_CODES = ['FILE_NOT_FOUND', 'FILE_NOT_READY'];
const UNAUTHENTICATED_CODES = ['SESSION_EXPIRED', 'UNAUTHENTICATED'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const { fileId } = await params;
  const sessionToken = await readStudentCollectionSessionToken();
  if (sessionToken === null) return unauthenticated();

  let ticket: { downloadUrl: string; filename: string };
  try {
    ticket = await new StudentCollectionFormsCoreClient(
      getStudentCollectionServerEnvironment(),
    ).createDownload(sessionToken, fileId);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && UNAUTHENTICATED_CODES.includes(error.code)) {
      return unauthenticated();
    }
    if (error instanceof CoreClientError && NOT_FOUND_CODES.includes(error.code)) return notFound();
    throw error;
  }

  const upstream = await fetch(ticket.downloadUrl, {
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
  });
  if (!upstream.ok || upstream.body === null) return notFound();
  const declaredLength = Number(upstream.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES) return notFound();

  /*
   * Served as an attachment with a generic type: the browser saves the file
   * rather than rendering it, so a document cannot script against this origin.
   */
  return new Response(upstream.body, {
    headers: {
      'Cache-Control': PRIVATE_CACHE_CONTROL,
      'Content-Disposition': contentDisposition(ticket.filename),
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Builds a `Content-Disposition` that survives a Thai filename.
 *
 * The ASCII fallback keeps only characters that cannot terminate the header,
 * and `filename*` carries the real name for browsers that read it.
 */
function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.-]/gu, '_') || 'document';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function notFound(): Response {
  return Response.json({ error: { code: 'FILE_NOT_FOUND' } }, { status: 404 });
}

function unauthenticated(): Response {
  return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
}
