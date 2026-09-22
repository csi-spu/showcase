import { z } from 'zod';

/*
 * The shape of the collection-forms contract, and the limits the Student is
 * told about.
 *
 * This module is deliberately free of `server-only`: the renderer needs these
 * types and limits to draw controls and to check a file before uploading it.
 * The client that actually talks to Core stays server-only, so the browser
 * learns the shape of the data without gaining a way to reach Core directly.
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

/*
 * Decimal bytes, matching the Core limits. These are deliberately not the
 * 1024-based limits used for public Work media.
 */
export const MAX_FILE_BYTES = 10_000_000;
export const MAX_SUBMISSION_BYTES = 50_000_000;

export const fieldSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    required: z.boolean(),
    type: z.enum(COLLECTION_FIELD_TYPES),
    options: z.array(z.string()).optional(),
    file: z
      .object({
        allowedFileTypes: z.array(z.enum(COLLECTION_FILE_TYPES)),
        maxFiles: z.number().int(),
      })
      .strict()
      .optional(),
    mappingKey: z.string().optional(),
  })
  .strict();

/*
 * A file is only ever an accepted document once an inspection has recorded a
 * result. `quarantined` and `inspecting` mean exactly that: not yet accepted.
 */
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
 * An upload slot plus the URL the browser sends the bytes to.
 *
 * The URL is short-lived and covers this one file. A successful send still
 * leaves the file quarantined: only a recorded inspection makes it submittable.
 */
export const uploadTicketSchema = z.object({ file: fileSchema, uploadUrl: z.url() }).strict();

export const formSchema = z
  .object({
    createdFromTemplateId: z.uuid().nullable(),
    deadlineAt: z.iso.datetime().nullable(),
    description: z.string(),
    fields: z.array(fieldSchema),
    groupId: z.uuid(),
    id: z.uuid(),
    status: z.enum(['draft', 'open', 'closed']),
    title: z.string(),
    version: z.number().int(),
  })
  .strict();

export const obligationSchema = z
  .object({
    draft: z
      .object({
        answers: z.record(z.string(), z.unknown()),
        files: fileSelectionSchema,
        updatedAt: z.iso.datetime(),
        version: z.number().int(),
      })
      .strict()
      .nullable(),
    form: formSchema,
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
  })
  .strict();

export const prefillSchema = z
  .object({
    fieldId: z.string(),
    mappingKey: z.string(),
    value: z.unknown(),
  })
  .strict();

export const draftSaveSchema = z.object({ version: z.number().int() }).strict();
export const submitSchema = z
  .object({ submissionId: z.uuid(), version: z.number().int() })
  .strict();

export type StudentCollectionField = z.infer<typeof fieldSchema>;
export type StudentCollectionFile = z.infer<typeof fileSchema>;
export type StudentCollectionFileStatus = StudentCollectionFile['status'];
export type StudentCollectionUploadTicket = z.infer<typeof uploadTicketSchema>;
export type StudentCollectionObligation = z.infer<typeof obligationSchema>;
export type StudentCollectionPrefill = z.infer<typeof prefillSchema>;
