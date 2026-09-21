import { z } from 'zod';
import type { AuthErrorMessage } from '../app/student-collection-auth-action-state';

const loginSchema = z.object({
  password: z.string().min(1).max(128),
  studentId: z.string().regex(/^\d{8}$/),
});

const passwordChangeSchema = z.object({
  confirmPassword: z.string().min(12).max(128),
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export interface StudentCollectionLoginInput {
  password: string;
  studentId: string;
}

export interface StudentCollectionPasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export function validateLogin(
  formData: FormData,
): StudentCollectionLoginInput | AuthErrorMessage {
  const result = loginSchema.safeParse({
    password: formData.get('password'),
    studentId: formData.get('studentId'),
  });
  return result.success ? result.data : 'credentials';
}

export function validatePasswordChange(
  formData: FormData,
): StudentCollectionPasswordChangeInput | AuthErrorMessage {
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
