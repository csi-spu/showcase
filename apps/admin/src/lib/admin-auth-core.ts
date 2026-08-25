import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const sessionStatusSchema = z
  .object({ sessionState: z.enum(['active', 'password_change_required']) })
  .strict();
const sessionResultSchema = sessionStatusSchema
  .extend({ sessionToken: z.string().min(1) })
  .strict();

export type AdminSessionStatus = z.infer<typeof sessionStatusSchema>;
export type AdminSessionResult = z.infer<typeof sessionResultSchema>;

interface AdminAuthCoreConfig {
  adminBffSecret: string;
  coreUrl: string;
}

export class AdminAuthCoreClient {
  private readonly client: CoreClient;

  constructor(config: AdminAuthCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: {
        headerName: 'x-admin-bff-secret',
        value: config.adminBffSecret,
      },
      fetchImpl,
    });
  }

  login(input: {
    adminLogin: string;
    password: string;
    sourceAddress: string;
  }): Promise<AdminSessionResult> {
    return this.client.request({
      body: { adminLogin: input.adminLogin, password: input.password },
      headers: { 'x-client-address': input.sourceAddress },
      method: 'POST',
      path: '/v1/internal/admin/auth/login',
      responseSchema: sessionResultSchema,
    });
  }

  getSession(sessionToken: string): Promise<AdminSessionStatus> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/admin/auth/session',
      responseSchema: sessionStatusSchema,
      sessionToken,
    });
  }

  changePassword(
    sessionToken: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<AdminSessionResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/admin/auth/change-password',
      responseSchema: sessionResultSchema,
      sessionToken,
    });
  }

  async logout(sessionToken: string): Promise<void> {
    await this.client.request({
      method: 'POST',
      path: '/v1/internal/admin/auth/logout',
      responseSchema: z.undefined(),
      sessionToken,
    });
  }
}

export { CoreClientError as AdminAuthCoreError };
