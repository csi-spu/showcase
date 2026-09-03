import { z } from 'zod';

const academicYearUpdateSchema = z.object({
  currentAcademicYear: z.coerce.number().int().min(2400).max(2700),
  expectedVersion: z.coerce.number().int().nonnegative(),
  idempotencyKey: z.uuid(),
});

const studentLookupSchema = z.object({
  operation: z.literal('lookup'),
  studentId: z.string().regex(/^[0-9]{8}$/),
});

const studentMutationBase = {
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.uuid(),
  studentAccountId: z.uuid(),
};

const studentExtensionSchema = z.object({
  ...studentMutationBase,
  accessEndsAcademicYear: z.coerce.number().int().min(2400).max(2700),
  operation: z.literal('extend'),
  reason: z.string().trim().min(1).max(2_000),
});

const studentPasswordResetSchema = z.object({
  ...studentMutationBase,
  operation: z.literal('reset'),
});

const studentStatusSchema = z.object({
  ...studentMutationBase,
  action: z.enum(['active', 'suspended']),
  operation: z.literal('setStatus'),
  reason: z.string().trim().min(1).max(2_000),
});

const studentNameCorrectionSchema = z.object({
  ...studentMutationBase,
  firstNameTh: z.string().trim().min(1).max(100),
  lastNameTh: z.string().trim().min(1).max(100),
  operation: z.literal('correctName'),
  reason: z.string().trim().min(1).max(2_000),
});

const studentAccountOperationSchema = z.discriminatedUnion('operation', [
  studentLookupSchema,
  studentExtensionSchema,
  studentNameCorrectionSchema,
  studentPasswordResetSchema,
  studentStatusSchema,
]);

export function validateAcademicYearUpdate(formData: FormData) {
  const result = academicYearUpdateSchema.safeParse({
    currentAcademicYear: formData.get('currentAcademicYear'),
    expectedVersion: formData.get('expectedVersion'),
    idempotencyKey: formData.get('idempotencyKey'),
  });
  return result.success ? result.data : null;
}

export function validateStudentAccountOperation(formData: FormData) {
  const result = studentAccountOperationSchema.safeParse({
    accessEndsAcademicYear: formData.get('accessEndsAcademicYear'),
    action: formData.get('action'),
    expectedVersion: formData.get('expectedVersion'),
    firstNameTh: formData.get('firstNameTh'),
    idempotencyKey: formData.get('idempotencyKey'),
    lastNameTh: formData.get('lastNameTh'),
    operation: formData.get('operation'),
    reason: formData.get('reason'),
    studentAccountId: formData.get('studentAccountId'),
    studentId: formData.get('studentId'),
  });
  return result.success ? result.data : null;
}
