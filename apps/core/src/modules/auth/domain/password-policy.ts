import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  evaluatePassword,
} from '@showcase/password-policy';

export type PasswordPolicyErrorCode =
  | 'PASSWORD_MATCHES_STUDENT_ID'
  | 'PASSWORD_MISSING_CHARACTER_CLASS'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_UNCHANGED';

export type PasswordPolicyResult =
  { isValid: true } | { errorCode: PasswordPolicyErrorCode; isValid: false };

interface PasswordChangeInput {
  currentPassword: string;
  isStudentId: boolean;
  newPassword: string;
}

export function evaluatePasswordChange({
  currentPassword,
  isStudentId,
  newPassword,
}: PasswordChangeInput): PasswordPolicyResult {
  if (isStudentId) {
    return { errorCode: 'PASSWORD_MATCHES_STUDENT_ID', isValid: false };
  }

  if (newPassword === currentPassword) {
    return { errorCode: 'PASSWORD_UNCHANGED', isValid: false };
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { errorCode: 'PASSWORD_TOO_SHORT', isValid: false };
  }

  if (newPassword.length > PASSWORD_MAX_LENGTH) {
    return { errorCode: 'PASSWORD_TOO_LONG', isValid: false };
  }

  if (!evaluatePassword(newPassword).isValid) {
    return { errorCode: 'PASSWORD_MISSING_CHARACTER_CLASS', isValid: false };
  }

  return { isValid: true };
}
