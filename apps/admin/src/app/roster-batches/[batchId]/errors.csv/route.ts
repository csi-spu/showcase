import { z } from 'zod';
import { isExpired } from '@/app/admin-auth-action-policy';
import { AdminRosterCoreClient } from '@/lib/admin-roster-core';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { getAdminServerEnvironment } from '@/lib/server-environment';

interface DownloadRosterErrorCsvDependencies {
  clearSession(): Promise<void>;
  download(sessionToken: string, batchId: string): Promise<string>;
  readSession(): Promise<string | null>;
}

const dependencies: DownloadRosterErrorCsvDependencies = {
  clearSession: clearAdminSessionToken,
  download: (sessionToken, batchId) =>
    new AdminRosterCoreClient(getAdminServerEnvironment()).downloadErrorCsv(sessionToken, batchId),
  readSession: readAdminSessionToken,
};

export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const { batchId } = await context.params;
  return downloadRosterErrorCsv(request, batchId, dependencies);
}

export async function downloadRosterErrorCsv(
  request: Request,
  batchId: string,
  deps: DownloadRosterErrorCsvDependencies,
): Promise<Response> {
  if (!z.uuid().safeParse(batchId).success) return unavailableResponse(404);
  const sessionToken = await deps.readSession();
  if (sessionToken === null) return expiredRedirect(request);
  try {
    const csv = await deps.download(sessionToken, batchId);
    return new Response(csv, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="roster-batch-${batchId}-errors.csv"`,
        'Content-Type': 'text/csv; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
      status: 200,
    });
  } catch (error: unknown) {
    if (isExpired(error)) {
      await deps.clearSession();
      return expiredRedirect(request);
    }
    return unavailableResponse(503);
  }
}

function expiredRedirect(request: Request): Response {
  return Response.redirect(new URL('/?expired=1', request.url), 303);
}

function unavailableResponse(status: number): Response {
  return new Response(null, { headers: { 'Cache-Control': 'no-store' }, status });
}
