import 'server-only';
import { CoreClient } from '@showcase/core-client';
import { z } from 'zod';
import {
  exportJobSchema,
  exportListSchema,
  fieldAnswersPageSchema,
  formHistoryPageSchema,
  formSchema,
  matrixPageSchema,
  pendingWorkSchema,
  previewTicketSchema,
  reopenPreviewSchema,
  reopenResultSchema,
  responseSummarySchema,
  reviewPositionSchema,
  reviewQueueSchema,
  roundStatusChangeSchema,
  submissionHistorySchema,
  templateSchema,
} from './instructor-collection-forms-contract';
import type {
  InstructorCollectionForm,
  InstructorExportJob,
  InstructorExportKind,
  InstructorCollectionTemplate,
  InstructorFieldAnswersPage,
  InstructorFormHistoryPage,
  InstructorMatrixPage,
  InstructorPendingWork,
  InstructorPreviewTicket,
  InstructorReopenPreview,
  InstructorReopenResult,
  InstructorResponseSummary,
  InstructorReviewOrder,
  InstructorReviewPosition,
  InstructorReviewQueue,
  InstructorRoundStatusChange,
  InstructorSubmissionHistory,
} from './instructor-collection-forms-contract';

/*
 * The contract itself lives in `instructor-collection-forms-contract`, which
 * the builder may import. Only this module -- the one that can actually reach
 * Core -- is server-only.
 */
export * from './instructor-collection-forms-contract';

const BASE = '/v1/internal/instructor/collection';

export class InstructorCollectionFormsCoreClient {
  private readonly client: CoreClient;

  constructor(
    config: { coreUrl: string; instructorBffSecret: string },
    fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-instructor-bff-secret', value: config.instructorBffSecret },
      fetchImpl,
    });
  }

  list(sessionToken: string, groupId: string): Promise<InstructorCollectionForm[]> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/groups/${groupId}/forms`,
      responseSchema: z.array(formSchema),
      sessionToken,
    });
  }

  create(sessionToken: string, groupId: string, body: unknown): Promise<InstructorCollectionForm> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/groups/${groupId}/forms`,
      body,
      responseSchema: formSchema,
      sessionToken,
    });
  }

  createFromTemplate(
    sessionToken: string,
    groupId: string,
    body: { templateId: string; title?: string },
  ): Promise<InstructorCollectionForm> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/groups/${groupId}/forms/from-template`,
      body,
      responseSchema: formSchema,
      sessionToken,
    });
  }

  /** Saves details and questions as one change using the caller's expected version. */
  save(
    sessionToken: string,
    formId: string,
    body: {
      deadlineAt: string | null;
      description: string;
      expectedVersion: number;
      fields: unknown[];
      title: string;
    },
  ): Promise<InstructorCollectionForm> {
    return this.client.request({
      method: 'PUT',
      path: `${BASE}/forms/${formId}`,
      body,
      responseSchema: formSchema,
      sessionToken,
    });
  }

  open(sessionToken: string, formId: string): Promise<InstructorCollectionForm> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/forms/${formId}/open`,
      body: {},
      responseSchema: formSchema,
      sessionToken,
    });
  }

  /**
   * Stops new first submissions on an open form.
   *
   * Requested corrections and checking continue on a closed form, so this ends
   * new arrivals only rather than freezing the form.
   */
  close(
    sessionToken: string,
    formId: string,
    body: { reason: string },
  ): Promise<InstructorCollectionForm> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/forms/${formId}/close`,
      body,
      responseSchema: formSchema,
      sessionToken,
    });
  }

  /** How many obligations reopening would create, read before confirming. */
  previewReopen(sessionToken: string, formId: string): Promise<InstructorReopenPreview> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/reopen-preview`,
      responseSchema: reopenPreviewSchema,
      sessionToken,
    });
  }

  /** One page of the form's edit history; `cursor` is the previous page's `nextCursor`. */
  formHistory(
    sessionToken: string,
    formId: string,
    cursor: string | null,
  ): Promise<InstructorFormHistoryPage> {
    const suffix = cursor === null ? '' : `?${new URLSearchParams({ cursor }).toString()}`;
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/history${suffix}`,
      responseSchema: formHistoryPageSchema,
      sessionToken,
    });
  }

  reopen(
    sessionToken: string,
    formId: string,
    body: { reason: string },
  ): Promise<InstructorReopenResult> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/forms/${formId}/reopen`,
      body,
      responseSchema: reopenResultSchema,
      sessionToken,
    });
  }

  /**
   * One page of the group's Student-by-form matrix.
   *
   * `after` is the account id of the last row already shown. Core bounds the
   * page size whatever is asked for, so an oversized `limit` is clamped rather
   * than refused.
   */
  groupMatrix(
    sessionToken: string,
    groupId: string,
    params: { after?: string | null; limit?: number } = {},
  ): Promise<InstructorMatrixPage> {
    const query = new URLSearchParams();
    if (params.after != null) query.set('after', params.after);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const suffix = query.size === 0 ? '' : `?${query.toString()}`;
    return this.client.request({
      method: 'GET',
      path: `${BASE}/groups/${groupId}/matrix${suffix}`,
      responseSchema: matrixPageSchema,
      sessionToken,
    });
  }

  /** Outstanding work in a round, shown before an Instructor confirms a closure. */
  roundPendingWork(sessionToken: string, roundId: string): Promise<InstructorPendingWork> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/rounds/${roundId}/pending-work`,
      responseSchema: pendingWorkSchema,
      sessionToken,
    });
  }

  closeRound(
    sessionToken: string,
    roundId: string,
    body: { reason: string },
  ): Promise<InstructorRoundStatusChange> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/rounds/${roundId}/close`,
      body,
      responseSchema: roundStatusChangeSchema,
      sessionToken,
    });
  }

  reopenRound(
    sessionToken: string,
    roundId: string,
    body: { reason: string },
  ): Promise<InstructorRoundStatusChange> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/rounds/${roundId}/reopen`,
      body,
      responseSchema: roundStatusChangeSchema,
      sessionToken,
    });
  }

  /** Every retained version of one Student's response, with its decisions. */
  listHistory(
    sessionToken: string,
    formId: string,
    studentAccountId: string,
  ): Promise<InstructorSubmissionHistory> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/students/${studentAccountId}/history`,
      responseSchema: submissionHistorySchema,
      sessionToken,
    });
  }

  saveAsTemplate(
    sessionToken: string,
    formId: string,
    body: { name: string },
  ): Promise<InstructorCollectionTemplate> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/forms/${formId}/save-as-template`,
      body,
      responseSchema: templateSchema,
      sessionToken,
    });
  }

  /** One page of a form's review queue: who was assigned it and what they submitted. */
  listSubmissions(
    sessionToken: string,
    formId: string,
    query: InstructorReviewOrder & { page: number },
  ): Promise<InstructorReviewQueue> {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
      sort: query.sort,
    });
    if (query.status !== null) params.set('status', query.status);
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/submissions?${params.toString()}`,
      responseSchema: reviewQueueSchema,
      sessionToken,
    });
  }

  /**
   * One page of the review queue narrowed by a search.
   *
   * Sent as a POST body because the term may be a Student ID prefix, which
   * never goes in a URL (ADR 0020).
   */
  searchSubmissions(
    sessionToken: string,
    formId: string,
    query: InstructorReviewOrder & { page: number; search: string },
  ): Promise<InstructorReviewQueue> {
    const { status, ...rest } = query;
    return this.client.request({
      method: 'POST',
      path: `${BASE}/forms/${formId}/submissions/search`,
      body: status === null ? rest : { ...rest, status },
      responseSchema: reviewQueueSchema,
      sessionToken,
    });
  }

  /** One Student's entry and place in the review queue, for moving to the previous or next. */
  reviewPosition(
    sessionToken: string,
    formId: string,
    studentAccountId: string,
    order: InstructorReviewOrder,
  ): Promise<InstructorReviewPosition> {
    const params = new URLSearchParams({ pageSize: String(order.pageSize), sort: order.sort });
    if (order.status !== null) params.set('status', order.status);
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/students/${studentAccountId}/review-position?${params.toString()}`,
      responseSchema: reviewPositionSchema,
      sessionToken,
    });
  }

  /** The anonymous Summary of a form's current responses: totals and one entry per question. */
  responseSummary(sessionToken: string, formId: string): Promise<InstructorResponseSummary> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/responses/summary`,
      responseSchema: responseSummarySchema,
      sessionToken,
    });
  }

  /**
   * One page of one question's answers.
   *
   * `summary` continues an anonymous Summary text list; `question` lists each
   * answer with its Student. `cursor` is the previous page's `nextCursor`.
   */
  fieldAnswers(
    sessionToken: string,
    formId: string,
    fieldId: string,
    params: { cursor: string | null; mode: 'question' | 'summary' },
  ): Promise<InstructorFieldAnswersPage> {
    const query = new URLSearchParams({ mode: params.mode });
    if (params.cursor !== null) query.set('cursor', params.cursor);
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/fields/${encodeURIComponent(fieldId)}/answers?${query.toString()}`,
      responseSchema: fieldAnswersPageSchema,
      sessionToken,
    });
  }

  /** Records a checking decision against the submission the Instructor reviewed. */
  check(
    sessionToken: string,
    submissionId: string,
    body: { decision: 'changes_required' | 'passed'; reason: string | null },
  ): Promise<{ status: string }> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/submissions/${submissionId}/check`,
      body,
      responseSchema: z.object({ status: z.string() }).strict(),
      sessionToken,
    });
  }

  /**
   * A short-lived signed URL for one submitted document.
   *
   * Core authorizes the file before signing, so this never reaches storage on
   * its own. The URL is used server-side and never handed to the browser.
   */
  createDownload(
    sessionToken: string,
    fileId: string,
  ): Promise<{ downloadUrl: string; filename: string }> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/files/${fileId}/download`,
      responseSchema: z.object({ downloadUrl: z.url(), filename: z.string() }).strict(),
      sessionToken,
    });
  }

  /**
   * A short-lived signed URL for one submitted JPEG or PNG image.
   *
   * Core refuses anything it did not detect as one of those, so the type here
   * is the one this app serves the bytes as. The URL never reaches the browser.
   */
  createPreview(sessionToken: string, fileId: string): Promise<InstructorPreviewTicket> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/files/${fileId}/preview`,
      responseSchema: previewTicketSchema,
      sessionToken,
    });
  }

  /**
   * Requests an export of selected forms in a group.
   *
   * Returns a pending job, not bytes: the snapshot is frozen by this call and
   * a worker builds the artifact, so the Instructor is never left holding a
   * request open for a group archive.
   */
  createExport(
    sessionToken: string,
    groupId: string,
    body: { formIds: string[]; kind: InstructorExportKind },
  ): Promise<InstructorExportJob> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/groups/${groupId}/exports`,
      body,
      responseSchema: exportJobSchema,
      sessionToken,
    });
  }

  /** A group's recent exports, newest first. */
  listExports(sessionToken: string, groupId: string): Promise<InstructorExportJob[]> {
    return this.client
      .request({
        method: 'GET',
        path: `${BASE}/groups/${groupId}/exports`,
        responseSchema: exportListSchema,
        sessionToken,
      })
      .then((page) => page.exports);
  }

  /** One export's current state, polled while it builds. */
  getExport(sessionToken: string, exportId: string): Promise<InstructorExportJob> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/exports/${exportId}`,
      responseSchema: exportJobSchema,
      sessionToken,
    });
  }

  /**
   * A short-lived signed URL for a ready export artifact.
   *
   * Core rechecks authorization on this request rather than trusting the one
   * that froze the snapshot, so access that has since ended is refused here.
   * The URL is used server-side and never handed to the browser.
   */
  createExportDownload(
    sessionToken: string,
    exportId: string,
  ): Promise<{ contentType: string; downloadUrl: string; filename: string }> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/exports/${exportId}/download`,
      responseSchema: z
        .object({ contentType: z.string(), downloadUrl: z.url(), filename: z.string() })
        .strict(),
      sessionToken,
    });
  }

  listTemplates(sessionToken: string): Promise<InstructorCollectionTemplate[]> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/templates`,
      responseSchema: z.array(templateSchema),
      sessionToken,
    });
  }

  createTemplate(sessionToken: string, body: unknown): Promise<InstructorCollectionTemplate> {
    return this.client.request({
      method: 'POST',
      path: `${BASE}/templates`,
      body,
      responseSchema: templateSchema,
      sessionToken,
    });
  }

  updateTemplate(
    sessionToken: string,
    templateId: string,
    body: unknown,
  ): Promise<InstructorCollectionTemplate> {
    return this.client.request({
      method: 'PUT',
      path: `${BASE}/templates/${templateId}`,
      body,
      responseSchema: templateSchema,
      sessionToken,
    });
  }
}
