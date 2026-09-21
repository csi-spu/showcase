import { z } from 'zod';
import type { AuthErrorMessage } from '../app/instructor-auth-action-state';

const loginSchema = z.object({
  instructorLogin: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/)),
  password: z.string().min(1).max(128),
});

const passwordChangeSchema = z.object({
  confirmPassword: z.string().min(12).max(128),
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export interface InstructorLoginInput {
  instructorLogin: string;
  password: string;
}

export interface InstructorPasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export function validateLogin(formData: FormData): InstructorLoginInput | AuthErrorMessage {
  const result = loginSchema.safeParse({
    instructorLogin: formData.get('instructorLogin'),
    password: formData.get('password'),
  });
  return result.success ? result.data : 'credentials';
}

export function validatePasswordChange(
  formData: FormData,
): InstructorPasswordChangeInput | AuthErrorMessage {
  const result = passwordChangeSchema.safeParse({
    confirmPassword: formData.get('confirmPassword'),
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  });
  if (!result.success || result.data.newPassword === result.data.currentPassword) {
    return 'passwordPolicy';
  }
  if (result.data.newPassword !== result.data.confirmPassword) {
    return 'passwordMismatch';
  }
  return {
    currentPassword: result.data.currentPassword,
    newPassword: result.data.newPassword,
  };
}
