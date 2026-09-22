import { z } from 'zod';

/*
 * The shape of the collection-forms contract.
 *
 * This module is deliberately free of `server-only`: the builder needs these
 * types and limits to draw its editors. The client that actually talks to Core
 * stays server-only, so the browser learns the shape of the data without
 * gaining a way to reach Core directly.
 */

export const COLLECTION_FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'date',
  'single_choice',
  'multiple_choice',
  'file_upload',
] as const;

export const COLLECTION_FILE_TYPES = ['pdf', 'docx', 'xlsx', 'jpeg', 'png'] as const;

export type CollectionFieldType = (typeof COLLECTION_FIELD_TYPES)[number];
export type CollectionFileType = (typeof COLLECTION_FILE_TYPES)[number];

export const fileConfigSchema = z
  .object({
    allowedFileTypes: z.array(z.enum(COLLECTION_FILE_TYPES)),
    maxFiles: z.number().int(),
  })
  .strict();

export const fieldSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    required: z.boolean(),
    type: z.enum(COLLECTION_FIELD_TYPES),
    options: z.array(z.string()).optional(),
    file: fileConfigSchema.optional(),
    mappingKey: z.string().optional(),
  })
  .strict();

export const formSchema = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['draft', 'open', 'closed']),
    fields: z.array(fieldSchema),
    deadlineAt: z.iso.datetime().nullable(),
    version: z.number().int(),
    createdFromTemplateId: z.uuid().nullable(),
  })
  .strict();

export const templateSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    fields: z.array(fieldSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    version: z.number().int(),
  })
  .strict();

export const fileSchema = z
  .object({
    byteSize: z.number().int(),
    createdAt: z.iso.datetime(),
    fieldId: z.string(),
    id: z.uuid(),
    inspectionErrorCode: z.string().nullable(),
    originalFilename: z.string(),
    status: z.enum(['quarantined', 'inspecting', 'ready', 'failed']),
  })
  .strict();

export const fileSelectionSchema = z.record(z.string(), z.array(fileSchema));

/**
 * One Student's standing on a form, as the review queue shows it.
 *
 * Carries submitted content only. What a Student is still drafting is not part
 * of this contract, because Core does not send it.
 */
export const reviewEntrySchema = z
  .object({
    latestCheckingReason: z.string().nullable(),
    latestSubmission: z
      .object({
        answers: z.record(z.string(), z.unknown()),
        files: fileSelectionSchema,
        id: z.uuid(),
        submittedAt: z.iso.datetime(),
        version: z.number().int(),
      })
      .strict()
      .nullable(),
    rosterName: z.object({ firstNameTh: z.string(), lastNameTh: z.string() }).strict(),
    status: z.enum([
      'not_submitted',
      'awaiting_checking',
      'changes_required',
      'passed',
      'withdrawn',
    ]),
    studentAccountId: z.uuid(),
  })
  .strict();

export const reviewQueueSchema = z
  .object({ entries: z.array(reviewEntrySchema), form: formSchema })
  .strict();

export type InstructorCollectionField = z.infer<typeof fieldSchema>;
export type InstructorCollectionFile = z.infer<typeof fileSchema>;
export type InstructorCollectionForm = z.infer<typeof formSchema>;
export type InstructorCollectionTemplate = z.infer<typeof templateSchema>;
export type InstructorReviewEntry = z.infer<typeof reviewEntrySchema>;
export type InstructorReviewQueue = z.infer<typeof reviewQueueSchema>;
