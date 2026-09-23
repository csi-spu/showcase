import 'server-only';
import { CoreClient } from '@showcase/core-client';
import { z } from 'zod';
import {
  draftSaveSchema,
  obligationSchema,
  prefillSchema,
  submissionHistorySchema,
  submitSchema,
  uploadTicketSchema,
} from './student-collection-forms-contract';
import type {
  StudentCollectionObligation,
  StudentCollectionPrefill,
  StudentCollectionSubmissionHistory,
  StudentCollectionUploadTicket,
} from './student-collection-forms-contract';

/*
 * The contract itself lives in `student-collection-forms-contract`, which the
 * renderer may import. Only this module -- the one that can actually reach Core
 * -- is server-only.
 */
export * from './student-collection-forms-contract';

const BASE = '/v1/internal/student-collection/forms';

export class StudentCollectionFormsCoreClient {
  private readonly client: CoreClient;

  constructor(
    config: { coreUrl: string; studentCollectionBffSecret: string },
    fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: {
        headerName: 'x-student-collection-bff-secret',
        value: config.studentCollectionBffSecret,
      },
      fetchImpl,
    });
  }

  list(token: string): Promise<StudentCollectionObligation[]> {
    return this.client.request({
      method: 'GET',
      path: BASE,
      responseSchema: z.array(obligationSchema),
      sessionToken: token,
    });
  }

  /**
   * Every version this Student has submitted for one form.
   *
   * Core scopes this to the caller, so a Student can only ever read their own.
   */
  listHistory(token: string, formId: string): Promise<StudentCollectionSubmissionHistory> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/${formId}/history`,
      responseSchema: submissionHistorySchema,
      sessionToken: token,
    });
  }

  /** Values the system can fill in, kept separate so the Student can see and change them. */
  listPrefills(token: string, formId: string): Promise<StudentCollectionPrefill[]> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/${formId}/prefills`,
      responseSchema: z.array(prefillSchema),
      sessionToken: token,
    });
  }

  /** Saves work in progress. This is never a submission. */
  saveDraft(
    token: string,
    formId: string,
    body: { answers: Record<string, unknown>; expectedVersion: number },
  ): Promise<z.infer<typeof draftSaveSchema>> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/${formId}/draft`,
      body,
      responseSchema: draftSaveSchema,
      sessionToken: token,
    });
  }

  /**
   * Registers an upload slot and returns where to send the bytes.
   *
   * The returned file starts `quarantined`. It is not an accepted document and
   * cannot be submitted until an inspection records a result.
   */
  createUpload(
    token: string,
    formId: string,
    body: {
      byteSize: number;
      declaredContentType: string;
      fieldId: string;
      filename: string;
    },
  ): Promise<StudentCollectionUploadTicket> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/${formId}/uploads`,
      body,
      responseSchema: uploadTicketSchema,
      sessionToken: token,
    });
  }

  attachFile(
    token: string,
    formId: string,
    body: { fieldId: string; fileId: string },
  ): Promise<{ status: string }> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/${formId}/draft/files`,
      body,
      responseSchema: z.object({ status: z.string() }).strict(),
      sessionToken: token,
    });
  }

  detachFile(token: string, formId: string, fileId: string): Promise<{ status: string }> {
    return this.client.request({
      method: 'DELETE',
      path: `${BASE}/${formId}/draft/files/${fileId}`,
      responseSchema: z.object({ status: z.string() }).strict(),
      sessionToken: token,
    });
  }

  /**
   * Asks Core for a short-lived link to one of the Student's own documents.
   *
   * The URL is used server-side and never handed to the browser, so a private
   * document cannot leak through a link the Student could share.
   */
  createDownload(
    token: string,
    fileId: string,
  ): Promise<{ downloadUrl: string; filename: string }> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/files/${fileId}/download`,
      responseSchema: z.object({ downloadUrl: z.url(), filename: z.string() }).strict(),
      sessionToken: token,
    });
  }

  /** The explicit submit. `idempotencyKey` makes a repeated request safe. */
  submit(
    token: string,
    formId: string,
    idempotencyKey: string,
  ): Promise<z.infer<typeof submitSchema>> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/${formId}/submit`,
      body: { idempotencyKey },
      responseSchema: submitSchema,
      sessionToken: token,
    });
  }
}
