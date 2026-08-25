import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const rosterBatchSchema = z
  .object({
    batchId: z.uuid(),
    createdCount: z.number().int().nonnegative(),
    entryYear: z.number().int().min(2400).max(2700),
    failedCount: z.number().int().nonnegative(),
    processedRowCount: z.number().int().nonnegative(),
    status: z.enum(['pending', 'processing', 'completed', 'completed_with_errors']),
    totalRowCount: z.number().int().min(0).max(10_000),
    unchangedCount: z.number().int().nonnegative(),
    uploadedAt: z.iso.datetime(),
  })
  .strict();

export type AdminRosterBatch = z.infer<typeof rosterBatchSchema>;

interface AdminRosterCoreConfig {
  adminBffSecret: string;
  coreUrl: string;
}

export class AdminRosterCoreClient {
  private readonly client: CoreClient;

  constructor(config: AdminRosterCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-admin-bff-secret', value: config.adminBffSecret },
      fetchImpl,
    });
  }

  createBatch(
    sessionToken: string,
    entryYear: number,
    content: Uint8Array<ArrayBuffer>,
  ): Promise<AdminRosterBatch> {
    return this.client.request({
      headers: { 'content-type': 'text/csv', 'x-entry-year': entryYear.toString() },
      method: 'POST',
      path: '/v1/internal/admin/roster-batches',
      rawBody: content,
      responseSchema: rosterBatchSchema,
      sessionToken,
    });
  }

  getBatch(sessionToken: string, batchId: string): Promise<AdminRosterBatch> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/roster-batches/${batchId}`,
      responseSchema: rosterBatchSchema,
      sessionToken,
    });
  }
}

export { CoreClientError as AdminRosterCoreError };
