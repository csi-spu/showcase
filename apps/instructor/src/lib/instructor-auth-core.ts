import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const sessionStatusSchema = z
  .object({
    /*
     * The signed-in instructor's Thai name, for the account block in the
     * sidebar. Nullable: the name lives in a separate table and is joined in,
     * so an account without one must still resolve its session rather than be
     * signed out over a missing display string.
     */
    displayName: z.string().min(1).nullable(),
    sessionState: z.enum(['active', 'password_change_required']),
  })
  .strict();
/*
 * Login and change-password return the session token and no name, so this
 * omits `displayName` rather than inheriting it -- `.strict()` would
 * otherwise reject their responses for the field they do not send.
 */
const sessionResultSchema = sessionStatusSchema
  .omit({ displayName: true })
  .extend({ sessionToken: z.string().min(1) })
  .strict();

export type InstructorSessionStatus = z.infer<typeof sessionStatusSchema>;
export type InstructorSessionResult = z.infer<typeof sessionResultSchema>;

interface InstructorAuthCoreConfig {
  coreUrl: string;
  instructorBffSecret: string;
}

export class InstructorAuthCoreClient {
  private readonly client: CoreClient;

  constructor(config: InstructorAuthCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: {
        headerName: 'x-instructor-bff-secret',
        value: config.instructorBffSecret,
      },
      fetchImpl,
    });
  }

  login(input: {
    instructorLogin: string;
    password: string;
    sourceAddress: string;
  }): Promise<InstructorSessionResult> {
    return this.client.request({
      body: { instructorLogin: input.instructorLogin, password: input.password },
      headers: { 'x-client-address': input.sourceAddress },
      method: 'POST',
      path: '/v1/internal/instructor/auth/login',
      responseSchema: sessionResultSchema,
    });
  }

  getSession(sessionToken: string): Promise<InstructorSessionStatus> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/instructor/auth/session',
      responseSchema: sessionStatusSchema,
      sessionToken,
    });
  }

  changePassword(
    sessionToken: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<InstructorSessionResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/instructor/auth/change-password',
      responseSchema: sessionResultSchema,
      sessionToken,
    });
  }

  async logout(sessionToken: string): Promise<void> {
    await this.client.request({
      method: 'POST',
      path: '/v1/internal/instructor/auth/logout',
      responseSchema: z.undefined(),
      sessionToken,
    });
  }
}

export { CoreClientError as InstructorAuthCoreError };
