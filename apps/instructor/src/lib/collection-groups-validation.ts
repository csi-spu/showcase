import { z } from 'zod';

const createRoundSchema = z.object({ name: z.string().trim().min(1).max(200) });
const createGroupSchema = z.object({ name: z.string().trim().min(1).max(200) });
const addByStudentIdsSchema = z.object({
  studentIds: z
    .string()
    .transform((value) =>
      value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .pipe(
      z
        .array(z.string().regex(/^\d{8}$/))
        .min(1)
        .max(500),
    ),
});
const addByEntryYearSchema = z.object({ entryYear: z.coerce.number().int().min(2400).max(2700) });
const withdrawSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  studentAccountId: z.uuid(),
});

export function validateCreateRound(formData: FormData) {
  const result = createRoundSchema.safeParse({ name: formData.get('name') });
  return result.success ? result.data : null;
}

export function validateCreateGroup(formData: FormData) {
  const result = createGroupSchema.safeParse({ name: formData.get('name') });
  return result.success ? result.data : null;
}

export function validateAddByStudentIds(formData: FormData) {
  const result = addByStudentIdsSchema.safeParse({ studentIds: formData.get('studentIds') });
  return result.success ? result.data : null;
}

export function validateAddByEntryYear(formData: FormData) {
  const result = addByEntryYearSchema.safeParse({ entryYear: formData.get('entryYear') });
  return result.success ? result.data : null;
}

export function validateWithdraw(formData: FormData) {
  const result = withdrawSchema.safeParse({
    reason: formData.get('reason'),
    studentAccountId: formData.get('studentAccountId'),
  });
  return result.success ? result.data : null;
}
