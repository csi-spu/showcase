import { z } from 'zod';
import { studentIdSchema } from './member-selection-contract';

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
 * What one Student owes on one form, as Core stores it.
 *
 * Declared once because three surfaces read it: the review queue, submission
 * history, and the matrix. The matrix widens it with `not_required`, which is
 * the absence of an obligation rather than a stored state.
 */
export const obligationStatusSchema = z.enum([
  'not_submitted',
  'awaiting_checking',
  'changes_required',
  'passed',
  'withdrawn',
]);

/**
 * One Student's standing on a form, as the review queue shows it.
 *
 * Carries submitted content only. What a Student is still drafting is not part
 * of this contract, because Core does not send it.
 */
export const reviewEntrySchema = z
  .object({
    /** When the first version was sent, retained even if the deadline later moves. */
    firstSubmittedAt: z.iso.datetime().nullable(),
    /** Decided by Core against the current deadline, so an extension clears it. */
    isLate: z.boolean(),
    latestCheckingReason: z.string().nullable(),
    latestSubmission: z
      .object({
        answers: z.record(z.string(), z.unknown()),
        fields: z.array(fieldSchema),
        files: fileSelectionSchema,
        formVersion: z.number().int().positive(),
        id: z.uuid(),
        submittedAt: z.iso.datetime(),
        version: z.number().int(),
      })
      .strict()
      .nullable(),
    rosterName: z.object({ firstNameTh: z.string(), lastNameTh: z.string() }).strict(),
    status: obligationStatusSchema,
    studentAccountId: z.uuid(),
    studentId: studentIdSchema,
  })
  .strict();

export const reviewQueueSchema = z
  .object({ entries: z.array(reviewEntrySchema), form: formSchema })
  .strict();

/**
 * How many obligations reopening a closed form would create.
 *
 * Reopening is not a request for everyone to submit again, so this counts only
 * current members who never received an obligation.
 */
export const reopenPreviewSchema = z.object({ newlyAssignedCount: z.number().int() }).strict();

/** The reopened form, plus how many obligations the reopen actually created. */
export const reopenResultSchema = z
  .object({ form: formSchema, newlyAssignedCount: z.number().int() })
  .strict();

/**
 * Work still outstanding in a round, shown before an Instructor confirms a
 * closure. Closing does not require this to be zero; it requires seeing it.
 */
export const pendingWorkSchema = z
  .object({
    awaitingChecking: z.number().int(),
    changesRequired: z.number().int(),
    notSubmitted: z.number().int(),
    total: z.number().int(),
  })
  .strict();

/*
 * Core answers a status change with the same summary the preview reads, so it
 * reuses that schema rather than restating the shape. A second copy drifted
 * once already: it omitted `total`, and the strict parse turned every closure
 * into a generic failure.
 */
export const roundStatusChangeSchema = z
  .object({
    pendingWork: pendingWorkSchema,
  })
  .strict();

const checkingEventSchema = z
  .object({
    decision: z.enum(['changes_required', 'passed']),
    /** A display name only. Core never sends the checking Account's id here. */
    instructorName: z.string(),
    occurredAt: z.iso.datetime(),
    reason: z.string().nullable(),
  })
  .strict();

/**
 * Every retained version of one Student's response, newest first.
 *
 * Carries submitted content and the decisions against it. A current draft is
 * not history and is not part of this contract.
 */
export const submissionHistorySchema = z
  .object({
    entries: z.array(
      z
        .object({
          answers: z.record(z.string(), z.unknown()),
          checkingEvents: z.array(checkingEventSchema),
          fields: z.array(fieldSchema),
          files: fileSelectionSchema,
          formVersion: z.number().int().positive(),
          id: z.uuid(),
          submittedAt: z.iso.datetime(),
          version: z.number().int(),
        })
        .strict(),
    ),
    firstSubmittedAt: z.iso.datetime().nullable(),
    form: z
      .object({
        deadlineAt: z.iso.datetime().nullable(),
        fields: z.array(fieldSchema),
        id: z.uuid(),
        status: z.enum(['draft', 'open', 'closed']),
        title: z.string(),
      })
      .strict(),
    isLate: z.boolean(),
    status: obligationStatusSchema,
  })
  .strict();

/**
 * One page of the group's Student-by-form matrix.
 *
 * Bounded by Core in both directions: `rows` is a cursor page of members and
 * `forms` is a capped set of columns, so a large group cannot turn this view
 * into an unbounded read.
 */
export const matrixCellSchema = z
  .object({
    formId: z.uuid(),
    /*
     * Orthogonal to `status`: a passed submission can still have arrived late,
     * and Core derives this against the form's current deadline.
     */
    isLate: z.boolean(),
    /* `not_required` means no obligation exists, not that nothing was sent. */
    status: z.union([obligationStatusSchema, z.literal('not_required')]),
  })
  .strict();

export const matrixRowSchema = z
  .object({
    cells: z.array(matrixCellSchema),
    isWithdrawn: z.boolean(),
    rosterName: z.object({ firstNameTh: z.string(), lastNameTh: z.string() }).strict(),
    studentAccountId: z.uuid(),
    studentId: studentIdSchema,
  })
  .strict();

/* Counts for the rows on this page. Group-wide totals are `pendingWorkSchema`. */
export const matrixSummarySchema = z
  .object({
    awaitingChecking: z.number().int(),
    changesRequired: z.number().int(),
    late: z.number().int(),
    notRequired: z.number().int(),
    notSubmitted: z.number().int(),
    passed: z.number().int(),
    withdrawn: z.number().int(),
  })
  .strict();

export const matrixPageSchema = z
  .object({
    forms: z.array(
      z
        .object({
          deadlineAt: z.iso.datetime().nullable(),
          id: z.uuid(),
          status: z.enum(['draft', 'open', 'closed']),
          title: z.string(),
        })
        .strict(),
    ),
    /** The account id of the last row shown, or null at the end of the group. */
    nextCursor: z.uuid().nullable(),
    rows: z.array(matrixRowSchema),
    summary: matrixSummarySchema,
    /** Every current and withdrawn member, not only the rows on this page. */
    totalMembers: z.number().int(),
  })
  .strict();

/**
 * One export job.
 *
 * An export is asynchronous: the request freezes a snapshot and returns a
 * pending job, and a worker builds the artifact. Everything optional here is
 * absent until the artifact is ready, which is also when the expiry clock
 * starts. Who requested it is deliberately not part of the contract.
 */
export const exportJobSchema = z
  .object({
    /** Null until the artifact exists. */
    byteSize: z.number().int().nullable(),
    /** Set only when the job failed for good, after its retries. */
    errorCode: z.string().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    id: z.uuid(),
    kind: z.enum(['excel', 'zip']),
    readyAt: z.iso.datetime().nullable(),
    requestedAt: z.iso.datetime(),
    status: z.enum(['pending', 'building', 'ready', 'failed', 'expired']),
  })
  .strict();

export const exportListSchema = z.object({ exports: z.array(exportJobSchema) }).strict();

export type InstructorCollectionField = z.infer<typeof fieldSchema>;
export type InstructorCollectionFile = z.infer<typeof fileSchema>;
export type InstructorCollectionForm = z.infer<typeof formSchema>;
export type InstructorCollectionTemplate = z.infer<typeof templateSchema>;
export type InstructorReviewEntry = z.infer<typeof reviewEntrySchema>;
export type InstructorReviewQueue = z.infer<typeof reviewQueueSchema>;
export type InstructorPendingWork = z.infer<typeof pendingWorkSchema>;
export type InstructorReopenPreview = z.infer<typeof reopenPreviewSchema>;
export type InstructorReopenResult = z.infer<typeof reopenResultSchema>;
export type InstructorRoundStatusChange = z.infer<typeof roundStatusChangeSchema>;
export type InstructorSubmissionHistory = z.infer<typeof submissionHistorySchema>;
export type InstructorMatrixCell = z.infer<typeof matrixCellSchema>;
export type InstructorMatrixCellStatus = InstructorMatrixCell['status'];
export type InstructorMatrixPage = z.infer<typeof matrixPageSchema>;
export type InstructorMatrixRow = z.infer<typeof matrixRowSchema>;
export type InstructorMatrixSummary = z.infer<typeof matrixSummarySchema>;
export type InstructorExportJob = z.infer<typeof exportJobSchema>;
export type InstructorExportKind = InstructorExportJob['kind'];
export type InstructorExportStatus = InstructorExportJob['status'];
