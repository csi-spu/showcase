import 'server-only';
import { CoreClient } from '@showcase/core-client';
import { z } from 'zod';
import { formSchema, reviewQueueSchema, templateSchema } from './instructor-collection-forms-contract';
import type {
  InstructorCollectionForm,
  InstructorCollectionTemplate,
  InstructorReviewQueue,
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

  /** Replaces a Draft form's structure. Core rejects this once the form is open. */
  update(sessionToken: string, formId: string, body: unknown): Promise<InstructorCollectionForm> {
    return this.client.request({
      method: 'PUT',
      path: `${BASE}/forms/${formId}`,
      body,
      responseSchema: formSchema,
      sessionToken,
    });
  }

  updateMetadata(
    sessionToken: string,
    formId: string,
    body: unknown,
  ): Promise<InstructorCollectionForm> {
    return this.client.request({
      method: 'PUT',
      path: `${BASE}/forms/${formId}/metadata`,
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

  /** The review queue for one form: who was assigned it and what they submitted. */
  listSubmissions(sessionToken: string, formId: string): Promise<InstructorReviewQueue> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/forms/${formId}/submissions`,
      responseSchema: reviewQueueSchema,
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
