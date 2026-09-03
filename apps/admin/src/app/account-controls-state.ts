export type AccountControlErrorMessage =
  | 'backward'
  | 'completed'
  | 'forbidden'
  | 'inProgress'
  | 'invalid'
  | 'lastActiveAdmin'
  | 'loginTaken'
  | 'notFound'
  | 'providerUnavailable'
  | 'shortening'
  | 'stale'
  | 'unavailable';

export interface AcademicYearSettingsState {
  currentAcademicYear: number | null;
  updatedAt: string;
  version: number;
}

export interface StudentAccountControlsState {
  accessEndsAcademicYear: number;
  accountId: string;
  canUseStudentCapabilities: boolean;
  currentAcademicYear: number | null;
  entryYear: number;
  firstNameTh: string;
  lastNameTh: string;
  state: 'alumnus' | 'student' | 'unavailable';
  status: 'active' | 'suspended';
  version: number;
}

export interface AcademicYearActionState {
  error: AccountControlErrorMessage | null;
  idempotencyKey: string;
  settings: AcademicYearSettingsState | null;
}

export interface StudentAccountActionState {
  error: AccountControlErrorMessage | null;
  idempotencyKey: string;
  student: StudentAccountControlsState | null;
  temporaryPassword: string | null;
}

export type AcademicYearAction = (
  state: AcademicYearActionState,
  formData: FormData,
) => Promise<AcademicYearActionState>;

export type StudentAccountAction = (
  state: StudentAccountActionState,
  formData: FormData,
) => Promise<StudentAccountActionState>;
