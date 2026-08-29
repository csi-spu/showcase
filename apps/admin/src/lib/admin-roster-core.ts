import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const rosterBatchSchema = z
  .object({
    batchId: z.uuid(),
    createdCount: z.number().int().nonnegative(),
    entryYears: z.array(z.number().int().min(2400).max(2700)).max(100),
    failedCount: z.number().int().nonnegative(),
    processedRowCount: z.number().int().nonnegative(),
    status: z.enum(['pending', 'processing', 'completed', 'completed_with_errors']),
    totalRowCount: z.number().int().min(0).max(10_000),
    unchangedCount: z.number().int().nonnegative(),
    uploadedAt: z.iso.datetime(),
  })
  .strict();

export type AdminRosterBatch = z.infer<typeof rosterBatchSchema>;

export interface CreateAdminRosterStudentInput {
  firstNameTh: string;
  lastNameTh: string;
  studentId: string;
}

const rosterConflictSchema = z
  .object({
    batchId: z.uuid(),
    conflictId: z.uuid(),
    existingFirstNameTh: z.string().min(1),
    existingLastNameTh: z.string().min(1),
    incomingFirstNameTh: z.string().min(1),
    incomingLastNameTh: z.string().min(1),
    reason: z.string().min(1).max(2_000).nullable(),
    resolution: z.enum(['keep_existing', 'accept_incoming_name']).nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    rowNumber: z.number().int().min(2).max(10_001),
    status: z.enum(['pending', 'resolved']),
    version: z.number().int().positive(),
  })
  .strict();

const rosterConflictPageSchema = z
  .object({
    conflicts: z.array(rosterConflictSchema).max(100),
    nextAfterRowNumber: z.number().int().min(2).max(10_001).nullable(),
  })
  .strict();

export type AdminRosterConflict = z.infer<typeof rosterConflictSchema>;
export type AdminRosterConflictPage = z.infer<typeof rosterConflictPageSchema>;

export interface ResolveAdminRosterConflictInput {
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
  resolution: 'accept_incoming_name' | 'keep_existing';
}

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

  createBatch(sessionToken: string, content: Uint8Array<ArrayBuffer>): Promise<AdminRosterBatch> {
    return this.client.request({
      headers: { 'content-type': 'text/csv' },
      method: 'POST',
      path: '/v1/internal/admin/roster-batches',
      rawBody: content,
      responseSchema: rosterBatchSchema,
      sessionToken,
    });
  }

  createStudent(
    sessionToken: string,
    input: CreateAdminRosterStudentInput,
  ): Promise<AdminRosterBatch> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/admin/roster-students',
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

  async downloadErrorCsv(sessionToken: string, batchId: string): Promise<string> {
    const csv = await this.client.requestText({
      method: 'GET',
      path: `/v1/internal/admin/roster-batches/${batchId}/errors.csv`,
      sessionToken,
    });
    return csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;
  }

  listConflicts(
    sessionToken: string,
    batchId: string,
    afterRowNumber?: number,
  ): Promise<AdminRosterConflictPage> {
    const search = new URLSearchParams({ limit: '50' });
    if (afterRowNumber !== undefined) search.set('afterRowNumber', String(afterRowNumber));
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/roster-batches/${batchId}/conflicts?${search.toString()}`,
      responseSchema: rosterConflictPageSchema,
      sessionToken,
    });
  }

  resolveConflict(
    sessionToken: string,
    conflictId: string,
    input: ResolveAdminRosterConflictInput,
  ): Promise<AdminRosterConflict> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/roster-batches/conflicts/${conflictId}/resolution`,
      responseSchema: rosterConflictSchema,
      sessionToken,
    });
  }
}

export { CoreClientError as AdminRosterCoreError };
