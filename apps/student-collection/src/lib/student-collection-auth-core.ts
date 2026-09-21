import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const sessionStatusSchema = z
  .object({ sessionState: z.enum(['active', 'password_change_required']) })
  .strict();
const sessionResultSchema = sessionStatusSchema
  .extend({ sessionToken: z.string().min(1) })
  .strict();

export type StudentCollectionSessionStatus = z.infer<typeof sessionStatusSchema>;
export type StudentCollectionSessionResult = z.infer<typeof sessionResultSchema>;

interface StudentCollectionAuthCoreConfig {
  coreUrl: string;
  studentCollectionBffSecret: string;
}

export class StudentCollectionAuthCoreClient {
  private readonly client: CoreClient;

  constructor(config: StudentCollectionAuthCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: {
        headerName: 'x-student-collection-bff-secret',
        value: config.studentCollectionBffSecret,
      },
      fetchImpl,
    });
  }

  login(input: {
    password: string;
    sourceAddress: string;
    studentId: string;
  }): Promise<StudentCollectionSessionResult> {
    return this.client.request({
      body: { password: input.password, studentId: input.studentId },
      headers: { 'x-client-address': input.sourceAddress },
      method: 'POST',
      path: '/v1/internal/student-collection/auth/login',
      responseSchema: sessionResultSchema,
    });
  }

  getSession(sessionToken: string): Promise<StudentCollectionSessionStatus> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/student-collection/auth/session',
      responseSchema: sessionStatusSchema,
      sessionToken,
    });
  }

  changePassword(
    sessionToken: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<StudentCollectionSessionResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/student-collection/auth/change-password',
      responseSchema: sessionResultSchema,
      sessionToken,
    });
  }

  async logout(sessionToken: string): Promise<void> {
    await this.client.request({
      method: 'POST',
      path: '/v1/internal/student-collection/auth/logout',
      responseSchema: z.undefined(),
      sessionToken,
    });
  }
}

export { CoreClientError as StudentCollectionAuthCoreError };
