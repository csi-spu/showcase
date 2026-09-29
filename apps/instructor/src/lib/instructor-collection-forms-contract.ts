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
    /*
     * Whether inspection found a JPEG or PNG the Instructor may view inline.
     * Core derives it so the detected type itself never leaves Core. Optional
     * because a Core without the responses area does not send it; absent reads
     * as not previewable.
     */
    isPreviewable: z.boolean().optional(),
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
 * An index row: answers and files are read per Student or per question. The
 * content fields stay optional only so this app can deploy before a Core that
 * still sends them; nothing here reads them. What a Student is still drafting
 * is never part of this contract.
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
        answers: z.record(z.string(), z.unknown()).optional(),
        fields: z.array(fieldSchema).optional(),
        files: fileSelectionSchema.optional(),
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

/** One page of the review queue; Core filters, orders and pages it. */
export const reviewQueueSchema = z
  .object({
    entries: z.array(reviewEntrySchema),
    form: formSchema,
    /** The page returned, which Core clamps to the last page that exists. */
    page: z.number().int().positive(),
    /** Students matching the search, per status; the status filter is not applied. */
    statusCounts: z.record(obligationStatusSchema, z.number().int().nonnegative()),
    /** Students matching both the search and the status filter. */
    total: z.number().int().nonnegative(),
  })
  .strict();

/** A Student as the jump list names them: no Student ID. */
export const reviewStudentSchema = z
  .object({
    rosterName: z.object({ firstNameTh: z.string(), lastNameTh: z.string() }).strict(),
    studentAccountId: z.uuid(),
  })
  .strict();

/**
 * One Student's place in the review queue under a status filter and order.
 *
 * `position` is null when the filter no longer lists the Student, such as
 * after a decision; the neighbours are then where the Student would sort.
 */
export const reviewPositionSchema = z
  .object({
    entry: reviewEntrySchema,
    next: reviewStudentSchema.nullable(),
    page: z.number().int().positive(),
    pageStudents: z.array(reviewStudentSchema),
    position: z.number().int().positive().nullable(),
    previous: reviewStudentSchema.nullable(),
    total: z.number().int().nonnegative(),
  })
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

/**
 * One page of a form's edit history, newest first.
 *
 * Core compares the question snapshots and sends typed changes, so the app
 * only words them. `nextCursor` is opaque and null on the last page. Entries
 * carry the acting Instructor's name and never Student data.
 */
export const formHistoryChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('title_changed'), next: z.string(), previous: z.string() }).strict(),
  z.object({ kind: z.literal('description_changed') }).strict(),
  z
    .object({
      kind: z.literal('deadline_changed'),
      next: z.iso.datetime().nullable(),
      previous: z.iso.datetime().nullable(),
    })
    .strict(),
  z.object({ kind: z.literal('question_added'), label: z.string() }).strict(),
  z.object({ kind: z.literal('question_removed'), label: z.string() }).strict(),
  z
    .object({ kind: z.literal('question_renamed'), next: z.string(), previous: z.string() })
    .strict(),
  z
    .object({
      isRequired: z.boolean(),
      kind: z.literal('question_required_changed'),
      label: z.string(),
    })
    .strict(),
  z.object({ kind: z.literal('question_description_changed'), label: z.string() }).strict(),
  z.object({ kind: z.literal('question_options_changed'), label: z.string() }).strict(),
  z.object({ kind: z.literal('question_settings_changed'), label: z.string() }).strict(),
  z.object({ kind: z.literal('questions_reordered') }).strict(),
  z.object({ assignedCount: z.number().int(), kind: z.literal('opened') }).strict(),
  z.object({ kind: z.literal('closed'), reason: z.string() }).strict(),
  z
    .object({ assignedCount: z.number().int(), kind: z.literal('reopened'), reason: z.string() })
    .strict(),
]);

export const formHistoryPageSchema = z
  .object({
    entries: z.array(
      z
        .object({
          actorName: z.string(),
          changes: z.array(formHistoryChangeSchema),
          id: z.uuid(),
          occurredAt: z.iso.datetime(),
        })
        .strict(),
    ),
    nextCursor: z.string().nullable(),
  })
  .strict();

/*
 * The responses area.
 *
 * Summary is anonymous: counts and text values only, never who gave them.
 * Question pages name the Student behind each answer. Text pages and question
 * pages continue with an opaque cursor that is null on the last page.
 */
export const responseTotalsSchema = z
  .object({
    /** Current members; a withdrawn Student is no longer assigned. */
    assigned: z.number().int(),
    awaitingChecking: z.number().int(),
    changesRequired: z.number().int(),
    notSubmitted: z.number().int(),
    passed: z.number().int(),
  })
  .strict();

const valueCountSchema = z.object({ count: z.number().int(), value: z.string() }).strict();
const textValueSchema = z.object({ value: z.string() }).strict();

function textPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
}

const choiceSummaryShape = {
  answeredCount: z.number().int(),
  fieldId: z.string(),
  options: z.array(valueCountSchema),
  /** Selections of a value that is no longer one of the options. */
  otherCount: z.number().int(),
};

export const fieldSummarySchema = z.discriminatedUnion('type', [
  z.object({ ...choiceSummaryShape, type: z.literal('single_choice') }).strict(),
  z.object({ ...choiceSummaryShape, type: z.literal('multiple_choice') }).strict(),
  z
    .object({
      answeredCount: z.number().int(),
      fieldId: z.string(),
      /** A bar whose `from` equals `to` stands for one whole number. */
      histogram: z.array(
        z.object({ count: z.number().int(), from: z.number(), to: z.number() }).strict(),
      ),
      stats: z
        .object({ max: z.number(), mean: z.number(), median: z.number(), min: z.number() })
        .strict()
        .nullable(),
      type: z.literal('number'),
    })
    .strict(),
  z
    .object({
      answeredCount: z.number().int(),
      earliest: z.iso.date().nullable(),
      fieldId: z.string(),
      latest: z.iso.date().nullable(),
      months: z.array(
        z.object({ count: z.number().int(), month: z.string().regex(/^\d{4}-\d{2}$/u) }).strict(),
      ),
      type: z.literal('date'),
    })
    .strict(),
  z
    .object({
      answeredCount: z.number().int(),
      fieldId: z.string(),
      groups: textPageSchema(valueCountSchema),
      type: z.literal('short_text'),
    })
    .strict(),
  z
    .object({
      answeredCount: z.number().int(),
      answers: textPageSchema(textValueSchema),
      fieldId: z.string(),
      type: z.literal('long_text'),
    })
    .strict(),
  z
    .object({
      answeredCount: z.number().int(),
      fieldId: z.string(),
      fileCount: z.number().int(),
      notReadyCount: z.number().int(),
      type: z.literal('file_upload'),
    })
    .strict(),
]);

export const responseSummarySchema = z
  .object({
    fields: z.array(fieldSummarySchema),
    form: z
      .object({
        fields: z.array(fieldSchema),
        id: z.uuid(),
        status: z.enum(['draft', 'open', 'closed']),
        title: z.string(),
      })
      .strict(),
    totals: responseTotalsSchema,
  })
  .strict();

export const studentAnswerSchema = z
  .object({
    files: z.array(fileSchema),
    rosterName: z.object({ firstNameTh: z.string(), lastNameTh: z.string() }).strict(),
    studentAccountId: z.uuid(),
    /** Instructor-only (ADR 0020). */
    studentId: studentIdSchema,
    /** One option for a choice question: a multiple-choice answer is a row per option. */
    value: z.union([z.string(), z.number()]).nullable(),
  })
  .strict();

export const fieldAnswersPageSchema = z.discriminatedUnion('kind', [
  z
    .object({
      items: z.array(studentAnswerSchema),
      kind: z.literal('students'),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      items: z.array(valueCountSchema),
      kind: z.literal('groups'),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      items: z.array(textValueSchema),
      kind: z.literal('texts'),
      nextCursor: z.string().nullable(),
    })
    .strict(),
]);

/** A short-lived signed URL for one submitted image, with the type inspection detected. */
export const previewTicketSchema = z
  .object({
    contentType: z.enum(['image/jpeg', 'image/png']),
    previewUrl: z.url(),
  })
  .strict();

export type InstructorCollectionField = z.infer<typeof fieldSchema>;
export type InstructorCollectionFile = z.infer<typeof fileSchema>;
export type InstructorCollectionForm = z.infer<typeof formSchema>;
export type InstructorCollectionTemplate = z.infer<typeof templateSchema>;
export type InstructorReviewEntry = z.infer<typeof reviewEntrySchema>;
export type InstructorReviewQueue = z.infer<typeof reviewQueueSchema>;
export type InstructorReviewStudent = z.infer<typeof reviewStudentSchema>;
export type InstructorReviewPosition = z.infer<typeof reviewPositionSchema>;
/** What the Individual table shows of a queue page; the form is read once with the page. */
export type InstructorReviewQueuePage = Omit<InstructorReviewQueue, 'form'>;
export const REVIEW_SORTS = ['status', 'name', 'submittedDesc', 'submittedAsc'] as const;
export type InstructorReviewSort = (typeof REVIEW_SORTS)[number];
/* The highest queue page Core accepts; Core clamps it back to the last page that exists. */
export const MAX_REVIEW_PAGE = 10_000;

/** Which Students a review queue read lists, and in what order. */
export interface InstructorReviewOrder {
  pageSize: number;
  sort: InstructorReviewSort;
  /** Null lists every status. */
  status: InstructorReviewEntry['status'] | null;
}
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
export type InstructorFormHistoryChange = z.infer<typeof formHistoryChangeSchema>;
export type InstructorFormHistoryPage = z.infer<typeof formHistoryPageSchema>;
export type InstructorFormHistoryEntry = InstructorFormHistoryPage['entries'][number];
export type InstructorResponseTotals = z.infer<typeof responseTotalsSchema>;
export type InstructorFieldSummary = z.infer<typeof fieldSummarySchema>;
export type InstructorResponseSummary = z.infer<typeof responseSummarySchema>;
export type InstructorStudentAnswer = z.infer<typeof studentAnswerSchema>;
export type InstructorFieldAnswersPage = z.infer<typeof fieldAnswersPageSchema>;
export type InstructorPreviewTicket = z.infer<typeof previewTicketSchema>;

/* What the history panel's server function returns; failures carry no detail. */
export type FormHistoryReadResult = { ok: true; page: InstructorFormHistoryPage } | { ok: false };

/* What the Individual table receives for a new page, order or search; failures carry no detail. */
export type ReviewQueueReadResult = { ok: true; queue: InstructorReviewQueuePage } | { ok: false };

/* What "show more" in the responses area receives; failures carry no detail. */
export type FieldAnswersReadResult = { ok: true; page: InstructorFieldAnswersPage } | { ok: false };
