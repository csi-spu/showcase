import { z } from 'zod';
import type { AuthErrorMessage } from '../app/student-auth-action-state';
import { evaluateStudentPassword } from './student-password-policy';

const loginSchema = z.object({
  password: z.string().min(1).max(128),
  studentId: z.string().regex(/^\d{8}$/),
});

const passwordChangeSchema = z.object({
  confirmPassword: z.string().min(12).max(128),
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export interface LoginInput {
  password: string;
  studentId: string;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export function validateLogin(formData: FormData): LoginInput | AuthErrorMessage {
  const result = loginSchema.safeParse({
    password: formData.get('password'),
    studentId: formData.get('studentId'),
  });
  return result.success ? result.data : 'credentials';
}

export function validatePasswordChange(formData: FormData): PasswordChangeInput | AuthErrorMessage {
  const result = passwordChangeSchema.safeParse({
    confirmPassword: formData.get('confirmPassword'),
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  });
  if (
    !result.success ||
    result.data.newPassword === result.data.currentPassword ||
    !evaluateStudentPassword(result.data.newPassword).isValid
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
