import { z } from 'zod';
import {
  COLLECTION_FIELD_TYPES,
  COLLECTION_FILE_TYPES,
} from '@/lib/instructor-collection-forms-contract';

const MAX_FILES_PER_FIELD = 5;

const fileConfigSchema = z
  .object({
    allowedFileTypes: z.array(z.enum(COLLECTION_FILE_TYPES)).min(1),
    maxFiles: z.number().int().min(1).max(MAX_FILES_PER_FIELD),
  })
  .strict();

const fieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().trim().min(1).max(200),
    description: z.string().max(1_000),
    required: z.boolean(),
    type: z.enum(COLLECTION_FIELD_TYPES),
    options: z.array(z.string().min(1)).min(1).max(100).optional(),
    file: fileConfigSchema.optional(),
    mappingKey: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/u)
      .optional(),
  })
  .strict()
  /*
   * These cross-checks mirror Core. A choice field is meaningless without
   * options, a file field needs its limits, and a file can never carry a mapped
   * value because every form requires its own upload.
   */
  .refine(
    (field) =>
      (field.type === 'single_choice' || field.type === 'multiple_choice') ===
      (field.options !== undefined),
    { path: ['options'] },
  )
  .refine((field) => (field.type === 'file_upload') === (field.file !== undefined), {
    path: ['file'],
  })
  .refine((field) => !(field.type === 'file_upload' && field.mappingKey !== undefined), {
    path: ['mappingKey'],
  });

const fieldsSchema = z
  .array(fieldSchema)
  .min(1)
  .max(100)
  .refine((fields) => new Set(fields.map((field) => field.id)).size === fields.length, {
    path: ['id'],
  })
  .refine(
    (fields) => {
      const keys = fields
        .map((field) => field.mappingKey)
        .filter((key): key is string => key !== undefined);
      return new Set(keys).size === keys.length;
    },
    { path: ['mappingKey'] },
  );

/** The builder posts its field array as one JSON string rather than many inputs. */
const fieldsJsonSchema = z
  .string()
  .transform((raw, context) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      context.addIssue({ code: 'custom', message: 'fields is not valid JSON' });
      return z.NEVER;
    }
  })
  .pipe(fieldsSchema);

/*
 * A deadline arrives as a `datetime-local` value, which carries no zone. It is
 * read as Asia/Bangkok wall-clock time and stored as UTC, matching how the app
 * renders every other timestamp.
 */
const BANGKOK_OFFSET = '+07:00';

const deadlineSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u)
  .transform((value, context) => {
    const parsed = new Date(`${value}:00${BANGKOK_OFFSET}`);
    if (Number.isNaN(parsed.getTime())) {
      context.addIssue({ code: 'custom', message: 'deadline is not a real time' });
      return z.NEVER;
    }
    return parsed.toISOString();
  });

const metadataShape = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2_000),
  deadlineAt: z.union([deadlineSchema, z.literal('').transform(() => null)]),
};

const createFormSchema = z.object({ ...metadataShape, fields: fieldsJsonSchema });
const updateFormSchema = createFormSchema;
const metadataSchema = z.object(metadataShape);
const saveAsTemplateSchema = z.object({ name: z.string().trim().min(1).max(200) });
const createFromTemplateSchema = z.object({
  templateId: z.uuid(),
  title: z.string().trim().min(1).max(200),
});

/*
 * Mirrors Core: returning work requires a reason the Student can act on, and a
 * pass carries none. Checked here for immediate feedback and again in Core.
 */
const checkSubmissionSchema = z
  .object({
    decision: z.enum(['changes_required', 'passed']),
    reason: z
      .string()
      .trim()
      .max(2_000)
      .transform((value) => (value.length === 0 ? null : value)),
    submissionId: z.uuid(),
  })
  .refine((input) => input.decision === 'passed' || input.reason !== null, { path: ['reason'] });

type CreateFormInput = z.infer<typeof createFormSchema>;
type MetadataInput = z.infer<typeof metadataSchema>;
type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;
type CheckSubmissionInput = z.infer<typeof checkSubmissionSchema>;

export function validateCreateForm(formData: FormData): CreateFormInput | null {
  const result = createFormSchema.safeParse(readFormBody(formData));
  return result.success ? result.data : null;
}

export function validateUpdateForm(formData: FormData): CreateFormInput | null {
  const result = updateFormSchema.safeParse(readFormBody(formData));
  return result.success ? result.data : null;
}

export function validateFormMetadata(formData: FormData): MetadataInput | null {
  const result = metadataSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    deadlineAt: formData.get('deadlineAt') ?? '',
  });
  return result.success ? result.data : null;
}

export function validateSaveAsTemplate(formData: FormData): SaveAsTemplateInput | null {
  const result = saveAsTemplateSchema.safeParse({ name: formData.get('name') });
  return result.success ? result.data : null;
}

export function validateCreateFromTemplate(formData: FormData): CreateFromTemplateInput | null {
  const result = createFromTemplateSchema.safeParse({
    templateId: formData.get('templateId'),
    title: formData.get('title'),
  });
  return result.success ? result.data : null;
}

export function validateCheckSubmission(formData: FormData): CheckSubmissionInput | null {
  const result = checkSubmissionSchema.safeParse({
    decision: formData.get('decision'),
    reason: formData.get('reason') ?? '',
    submissionId: formData.get('submissionId'),
  });
  return result.success ? result.data : null;
}

/**
 * The reason recorded against a close or reopen.
 *
 * Mirrors the bound Core enforces so the Instructor sees an empty reason
 * rejected here rather than after a round trip. Core validates it again: this
 * is for the person, not for trust.
 */
const lifecycleReasonSchema = z.string().trim().min(1).max(2_000);

export function validateLifecycleReason(formData: FormData): string | null {
  const result = lifecycleReasonSchema.safeParse(formData.get('reason'));
  return result.success ? result.data : null;
}

function readFormBody(formData: FormData): Record<string, unknown> {
  return {
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    deadlineAt: formData.get('deadlineAt') ?? '',
    fields: formData.get('fields'),
  };
}
