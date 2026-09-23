/*
 * Streams one ready export artifact to the Instructor who requested it.
 *
 * The signed storage URL never reaches the browser: Core rechecks the current
 * session before signing -- an Instructor whose access ended cannot download an
 * export frozen while they still had it -- and this proxies the bytes. An
 * artifact that is still building, has expired, or failed is refused by Core.
 */

import { CoreClientError } from '@showcase/core-client';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';

const PRIVATE_CACHE_CONTROL = 'private, no-store';
const NOT_FOUND_CODES = ['EXPORT_NOT_FOUND'];
/* States the artifact legitimately reaches; the Instructor is told which one. */
const CONFLICT_CODES = ['EXPORT_EXPIRED', 'EXPORT_FAILED', 'EXPORT_NOT_READY'];
/*
 * A group archive is minutes of transfer, not seconds, and is not held in
 * memory here: the upstream body is piped straight through.
 */
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  const { exportId } = await params;
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) return unauthenticated();

  let ticket: { downloadUrl: string; filename: string };
  try {
    ticket = await new InstructorCollectionFormsCoreClient(
      getInstructorServerEnvironment(),
    ).createExportDownload(sessionToken, exportId);
  } catch (error: unknown) {
    if (
      error instanceof CoreClientError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      return unauthenticated();
    }
    if (error instanceof CoreClientError && NOT_FOUND_CODES.includes(error.code)) return notFound();
    if (error instanceof CoreClientError && CONFLICT_CODES.includes(error.code)) {
      return Response.json({ error: { code: error.code } }, { status: 409 });
    }
    throw error;
  }

  const upstream = await fetch(ticket.downloadUrl, {
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!upstream.ok || upstream.body === null) return notFound();

  /*
   * Served as an attachment with a generic type: the browser saves the file
   * rather than rendering it, so an archive cannot script against this origin.
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
 * Builds a `Content-Disposition` that survives a non-ASCII filename.
 *
 * The ASCII fallback keeps only characters that cannot terminate the header,
 * and `filename*` carries the real name for browsers that read it.
 */
function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.-]/gu, '_') || 'export';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function notFound(): Response {
  return Response.json({ error: { code: 'EXPORT_NOT_FOUND' } }, { status: 404 });
}

function unauthenticated(): Response {
  return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
}
