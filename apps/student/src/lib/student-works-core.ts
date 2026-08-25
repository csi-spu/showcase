import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const workCategorySchema = z.enum(['course_work', 'competition_entry', 'academic_article']);
const semesterSchema = z.enum(['1', '2', 'summer']);
const academicPeriodSchema = z
  .object({ semester: semesterSchema, year: z.number().int() })
  .strict();
const workLinkSchema = z.object({ label: z.string(), url: z.url() }).strict();
const normalizedTagSchema = z
  .object({ displayLabel: z.string(), normalizedIdentity: z.string() })
  .strict();
const workDraftContentSchema = z
  .object({
    academicPeriod: academicPeriodSchema,
    category: workCategorySchema,
    description: z.string(),
    links: z.array(workLinkSchema).max(5),
    summary: z.string(),
    tags: z.array(normalizedTagSchema).max(5),
    title: z.string(),
  })
  .strict();
const workDraftSchema = z
  .object({
    activityState: z.literal('active'),
    basePublishedRevisionId: z.uuid().nullable(),
    draft: workDraftContentSchema,
    publicationState: z.literal('never_published'),
    publicId: z.uuid(),
    version: z.number().int().positive(),
  })
  .strict();
const authoringContextSchema = z
  .object({ currentAcademicYear: z.number().int(), entryYear: z.number().int() })
  .strict();
const mutationResultSchema = z
  .object({ outcome: z.enum(['created', 'replayed', 'updated']), work: workDraftSchema })
  .strict();

export type WorkDraft = z.infer<typeof workDraftSchema>;
export type WorkAuthoringContext = z.infer<typeof authoringContextSchema>;
export type WorkMutationInput = {
  academicPeriod: z.infer<typeof academicPeriodSchema>;
  category: z.infer<typeof workCategorySchema>;
  description: string;
  idempotencyKey: string;
  links: Array<z.infer<typeof workLinkSchema>>;
  summary: string;
  tags: string[];
  title: string;
};
export type WorkUpdateInput = WorkMutationInput & { expectedVersion: number };

interface StudentWorksCoreConfig {
  coreUrl: string;
  studentBffSecret: string;
}

export class StudentWorksCoreClient {
  private readonly client: CoreClient;

  constructor(config: StudentWorksCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-student-bff-secret', value: config.studentBffSecret },
      fetchImpl,
    });
  }

  getAuthoringContext(sessionToken: string): Promise<WorkAuthoringContext> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/student/works/authoring-context',
      responseSchema: authoringContextSchema,
      sessionToken,
    });
  }

  getWork(sessionToken: string, publicId: string): Promise<WorkDraft> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/student/works/${publicId}`,
      responseSchema: workDraftSchema,
      sessionToken,
    });
  }

  createWork(sessionToken: string, input: WorkMutationInput) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/student/works',
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  updateWork(sessionToken: string, publicId: string, input: WorkUpdateInput) {
    return this.client.request({
      body: input,
      method: 'PUT',
      path: `/v1/internal/student/works/${publicId}`,
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }
}

export { CoreClientError as StudentWorksCoreError };
