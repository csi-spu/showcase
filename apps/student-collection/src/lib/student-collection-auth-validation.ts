import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  evaluatePassword,
} from '@showcase/password-policy';
import { z } from 'zod';
import type { AuthErrorMessage } from '../app/student-collection-auth-action-state';

const loginSchema = z.object({
  password: z.string().min(1).max(128),
  studentId: z.string().regex(/^\d{8}$/),
});

const passwordChangeSchema = z.object({
  confirmPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export interface StudentCollectionLoginInput {
  password: string;
  studentId: string;
}

export interface StudentCollectionPasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export function validateLogin(formData: FormData): StudentCollectionLoginInput | AuthErrorMessage {
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
  if (
    !result.success ||
    result.data.newPassword === result.data.currentPassword ||
    !evaluatePassword(result.data.newPassword).isValid
  ) {
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
