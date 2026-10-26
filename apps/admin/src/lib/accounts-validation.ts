import { z } from 'zod';

const createAdminSchema = z.object({
  adminLogin: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  firstNameTh: z.string().trim().min(1).max(100),
  lastNameTh: z.string().trim().min(1).max(100),
});

const setAdminStatusSchema = z.object({
  accountId: z.uuid(),
  action: z.enum(['active', 'suspended']),
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.uuid(),
  reason: z.string().trim().min(1).max(2_000),
});

const createInstructorSchema = z.object({
  firstNameTh: z.string().trim().min(1).max(100),
  instructorLogin: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  lastNameTh: z.string().trim().min(1).max(100),
});

const instructorRoleActionSchema = z.object({
  accountId: z.uuid(),
  idempotencyKey: z.uuid(),
});

const instructorPasswordResetSchema = z.object({
  accountId: z.uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.uuid(),
});

export function validateCreateAdmin(formData: FormData) {
  const result = createAdminSchema.safeParse({
    adminLogin: formData.get('adminLogin'),
    firstNameTh: formData.get('firstNameTh'),
    lastNameTh: formData.get('lastNameTh'),
  });
  return result.success ? result.data : null;
}

export function validateSetAdminStatus(formData: FormData) {
  const result = setAdminStatusSchema.safeParse({
    accountId: formData.get('accountId'),
    action: formData.get('action'),
    expectedVersion: formData.get('expectedVersion'),
    idempotencyKey: formData.get('idempotencyKey'),
    reason: formData.get('reason'),
  });
  return result.success ? result.data : null;
}

export function validateCreateInstructor(formData: FormData) {
  const result = createInstructorSchema.safeParse({
    firstNameTh: formData.get('firstNameTh'),
    instructorLogin: formData.get('instructorLogin'),
    lastNameTh: formData.get('lastNameTh'),
  });
  return result.success ? result.data : null;
}

export function validateInstructorRoleAction(formData: FormData) {
  const result = instructorRoleActionSchema.safeParse({
    accountId: formData.get('accountId'),
    idempotencyKey: formData.get('idempotencyKey'),
  });
  return result.success ? result.data : null;
}

export function validateInstructorPasswordReset(formData: FormData) {
  const result = instructorPasswordResetSchema.safeParse({
    accountId: formData.get('accountId'),
    expectedVersion: formData.get('expectedVersion'),
    idempotencyKey: formData.get('idempotencyKey'),
  });
  return result.success ? result.data : null;
}
