import type { AccountControlErrorMessage } from './account-controls-state';

export interface AdminAccountRow {
  accountId: string;
  createdAt: string;
  firstNameTh: string;
  hasInstructorRole: boolean;
  lastNameTh: string;
  status: 'active' | 'suspended';
  version: number;
}

export interface InstructorAccountRow {
  accountId: string;
  createdAt: string;
  firstNameTh: string;
  hasAdminRole: boolean;
  lastNameTh: string;
  status: 'active' | 'suspended';
  version: number;
}

export interface CreateAdminActionState {
  admin: { adminLogin: string } | null;
  error: AccountControlErrorMessage | null;
  idempotencyKey: string;
  temporaryPassword: string | null;
}

export interface SetAdminStatusActionState {
  admin: AdminAccountRow | null;
  error: AccountControlErrorMessage | null;
  idempotencyKey: string;
}

export interface CreateInstructorActionState {
  error: AccountControlErrorMessage | null;
  idempotencyKey: string;
  instructor: { instructorLogin: string } | null;
  temporaryPassword: string | null;
}

export interface InstructorRoleActionState {
  error: AccountControlErrorMessage | null;
  idempotencyKey: string;
  instructor: InstructorAccountRow | null;
}

export interface InstructorPasswordResetActionState {
  error: AccountControlErrorMessage | null;
  idempotencyKey: string;
  instructor: InstructorAccountRow | null;
  temporaryPassword: string | null;
}

export type CreateAdminAction = (
  state: CreateAdminActionState,
  formData: FormData,
) => Promise<CreateAdminActionState>;

export type SetAdminStatusAction = (
  state: SetAdminStatusActionState,
  formData: FormData,
) => Promise<SetAdminStatusActionState>;

export type CreateInstructorAction = (
  state: CreateInstructorActionState,
  formData: FormData,
) => Promise<CreateInstructorActionState>;

export type InstructorRoleAction = (
  state: InstructorRoleActionState,
  formData: FormData,
) => Promise<InstructorRoleActionState>;

export type InstructorPasswordResetAction = (
  state: InstructorPasswordResetActionState,
  formData: FormData,
) => Promise<InstructorPasswordResetActionState>;
