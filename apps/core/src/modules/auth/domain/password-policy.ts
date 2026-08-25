export type PasswordPolicyErrorCode =
  'PASSWORD_MATCHES_STUDENT_ID' | 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_UNCHANGED';

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

  if (newPassword.length < 12) {
    return { errorCode: 'PASSWORD_TOO_SHORT', isValid: false };
  }

  if (newPassword.length > 128) {
    return { errorCode: 'PASSWORD_TOO_LONG', isValid: false };
  }

  return { isValid: true };
}
