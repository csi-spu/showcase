import type { AccountControlErrorMessage } from './account-controls-state';

export interface AdminAccountRow {
  accountId: string;
  createdAt: string;
  firstNameTh: string;
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

export type CreateAdminAction = (
  state: CreateAdminActionState,
  formData: FormData,
) => Promise<CreateAdminActionState>;

export type SetAdminStatusAction = (
  state: SetAdminStatusActionState,
  formData: FormData,
) => Promise<SetAdminStatusActionState>;
