import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const academicYearSchema = z
  .object({
    currentAcademicYear: z.number().int().min(2400).max(2700).nullable(),
    updatedAt: z.iso.datetime(),
    version: z.number().int().nonnegative(),
  })
  .strict();

const studentAccountControlsSchema = z
  .object({
    accessEndsAcademicYear: z.number().int().min(2400).max(2700),
    accountId: z.uuid(),
    canUseStudentCapabilities: z.boolean(),
    currentAcademicYear: z.number().int().min(2400).max(2700).nullable(),
    entryYear: z.number().int().min(2400).max(2700),
    firstNameTh: z.string().min(1),
    lastNameTh: z.string().min(1),
    state: z.enum(['alumnus', 'student', 'unavailable']),
    version: z.number().int().positive(),
  })
  .strict();

const passwordResetSchema = z
  .object({
    student: studentAccountControlsSchema,
    temporaryPassword: z.string().min(12).max(128),
  })
  .strict();

const adminAccountControlsSchema = z
  .object({
    accountId: z.uuid(),
    createdAt: z.iso.datetime(),
    firstNameTh: z.string().min(1),
    lastNameTh: z.string().min(1),
    status: z.enum(['active', 'suspended']),
    version: z.number().int().positive(),
  })
  .strict();

const studentListPageSchema = z
  .object({
    items: z.array(studentAccountControlsSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

const adminListPageSchema = z
  .object({
    items: z.array(adminAccountControlsSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

const createAdminResultSchema = z
  .object({
    admin: z.object({ adminLogin: z.string().min(1) }).strict(),
    temporaryPassword: z.string().min(12).max(128),
  })
  .strict();

export type AdminAcademicYear = z.infer<typeof academicYearSchema>;
export type AdminStudentAccountControls = z.infer<typeof studentAccountControlsSchema>;
export type AdminPasswordReset = z.infer<typeof passwordResetSchema>;
export type AdminAccountControls = z.infer<typeof adminAccountControlsSchema>;
export type AdminStudentListPage = z.infer<typeof studentListPageSchema>;
export type AdminAdminListPage = z.infer<typeof adminListPageSchema>;
export type AdminCreateAdminResult = z.infer<typeof createAdminResultSchema>;

interface AdminAccountControlsCoreConfig {
  adminBffSecret: string;
  coreUrl: string;
}

export class AdminAccountControlsCoreClient {
  private readonly client: CoreClient;

  constructor(config: AdminAccountControlsCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-admin-bff-secret', value: config.adminBffSecret },
      fetchImpl,
    });
  }

  getAcademicYear(sessionToken: string): Promise<AdminAcademicYear> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/admin/account-controls/academic-year',
      responseSchema: academicYearSchema,
      sessionToken,
    });
  }

  updateAcademicYear(
    sessionToken: string,
    input: { currentAcademicYear: number; expectedVersion: number; idempotencyKey: string },
  ): Promise<AdminAcademicYear> {
    return this.client.request({
      body: input,
      method: 'PUT',
      path: '/v1/internal/admin/account-controls/academic-year',
      responseSchema: academicYearSchema,
      sessionToken,
    });
  }

  findStudent(sessionToken: string, studentId: string): Promise<AdminStudentAccountControls> {
    return this.client.request({
      body: { studentId },
      method: 'POST',
      path: '/v1/internal/admin/account-controls/students/lookup',
      responseSchema: studentAccountControlsSchema,
      sessionToken,
    });
  }

  extendStudentAccess(
    sessionToken: string,
    accountId: string,
    input: {
      accessEndsAcademicYear: number;
      expectedVersion: number;
      idempotencyKey: string;
      reason: string;
    },
  ): Promise<AdminStudentAccountControls> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/account-controls/students/${accountId}/access-extension`,
      responseSchema: studentAccountControlsSchema,
      sessionToken,
    });
  }

  correctStudentName(
    sessionToken: string,
    accountId: string,
    input: {
      expectedVersion: number;
      firstNameTh: string;
      idempotencyKey: string;
      lastNameTh: string;
      reason: string;
    },
  ): Promise<AdminStudentAccountControls> {
    return this.client.request({
      body: input,
      method: 'PUT',
      path: `/v1/internal/admin/account-controls/students/${accountId}/name`,
      responseSchema: studentAccountControlsSchema,
      sessionToken,
    });
  }

  resetStudentPassword(
    sessionToken: string,
    accountId: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ): Promise<AdminPasswordReset> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/account-controls/students/${accountId}/password-reset`,
      responseSchema: passwordResetSchema,
      sessionToken,
    });
  }

  listStudents(
    sessionToken: string,
    input: { cursor: string | null; search: string | null },
  ): Promise<AdminStudentListPage> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/account-controls/students${toQueryString(input)}`,
      responseSchema: studentListPageSchema,
      sessionToken,
    });
  }

  listAdmins(
    sessionToken: string,
    input: { cursor: string | null; search: string | null },
  ): Promise<AdminAdminListPage> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/admin/account-controls/admins${toQueryString(input)}`,
      responseSchema: adminListPageSchema,
      sessionToken,
    });
  }

  createAdmin(
    sessionToken: string,
    input: { adminLogin: string; firstNameTh: string; lastNameTh: string },
  ): Promise<AdminCreateAdminResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/admin/account-controls/admins',
      responseSchema: createAdminResultSchema,
      sessionToken,
    });
  }

  setAdminStatus(
    sessionToken: string,
    accountId: string,
    input: {
      action: 'active' | 'suspended';
      expectedVersion: number;
      idempotencyKey: string;
      reason: string;
    },
  ): Promise<AdminAccountControls> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/admin/account-controls/admins/${accountId}/status`,
      responseSchema: adminAccountControlsSchema,
      sessionToken,
    });
  }
}

function toQueryString(input: { cursor: string | null; search: string | null }): string {
  const params = new URLSearchParams();
  if (input.cursor !== null) params.set('cursor', input.cursor);
  if (input.search !== null) params.set('search', input.search);
  const query = params.toString();
  return query.length === 0 ? '' : `?${query}`;
}

export { CoreClientError as AdminAccountControlsCoreError };
