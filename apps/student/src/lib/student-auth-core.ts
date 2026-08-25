import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const sessionStatusSchema = z
  .object({
    canUseStudentCapabilities: z.boolean(),
    sessionState: z.enum(['active', 'password_change_required']),
  })
  .strict();
const sessionResultSchema = sessionStatusSchema
  .extend({
    sessionToken: z.string().min(1),
  })
  .strict();

export type StudentSessionStatus = z.infer<typeof sessionStatusSchema>;
export type StudentSessionResult = z.infer<typeof sessionResultSchema>;

interface StudentAuthCoreConfig {
  coreUrl: string;
  studentBffSecret: string;
}

export class StudentAuthCoreClient {
  private readonly client: CoreClient;

  constructor(config: StudentAuthCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: {
        headerName: 'x-student-bff-secret',
        value: config.studentBffSecret,
      },
      fetchImpl,
    });
  }

  login(input: {
    password: string;
    sourceAddress: string;
    studentId: string;
  }): Promise<StudentSessionResult> {
    return this.client.request({
      body: { password: input.password, studentId: input.studentId },
      headers: { 'x-client-address': input.sourceAddress },
      method: 'POST',
      path: '/v1/internal/student/auth/login',
      responseSchema: sessionResultSchema,
    });
  }

  getSession(sessionToken: string): Promise<StudentSessionStatus> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/student/auth/session',
      responseSchema: sessionStatusSchema,
      sessionToken,
    });
  }

  changePassword(
    sessionToken: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<StudentSessionResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/student/auth/change-password',
      responseSchema: sessionResultSchema,
      sessionToken,
    });
  }

  async logout(sessionToken: string): Promise<void> {
    await this.client.request({
      method: 'POST',
      path: '/v1/internal/student/auth/logout',
      responseSchema: z.undefined(),
      sessionToken,
    });
  }
}

export { CoreClientError as StudentAuthCoreError };
