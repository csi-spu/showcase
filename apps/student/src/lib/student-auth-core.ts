import { z } from 'zod';

const sessionStatusSchema = z.object({
  canUseStudentCapabilities: z.boolean(),
  sessionState: z.enum(['active', 'password_change_required']),
});
const sessionResultSchema = sessionStatusSchema.extend({
  sessionToken: z.string().min(1),
});
const errorSchema = z.object({ error: z.object({ code: z.string().min(1) }) });

export type StudentSessionStatus = z.infer<typeof sessionStatusSchema>;
export type StudentSessionResult = z.infer<typeof sessionResultSchema>;

export class StudentAuthCoreError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'StudentAuthCoreError';
  }
}

interface StudentAuthCoreConfig {
  coreUrl: string;
  studentBffSecret: string;
}

export class StudentAuthCoreClient {
  constructor(
    private readonly config: StudentAuthCoreConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  login(input: {
    password: string;
    sourceAddress: string;
    studentId: string;
  }): Promise<StudentSessionResult> {
    return this.request('login', sessionResultSchema, {
      body: JSON.stringify({ password: input.password, studentId: input.studentId }),
      headers: { 'x-client-address': input.sourceAddress },
      method: 'POST',
    });
  }

  getSession(sessionToken: string): Promise<StudentSessionStatus> {
    return this.request('session', sessionStatusSchema, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      method: 'GET',
    });
  }

  changePassword(
    sessionToken: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<StudentSessionResult> {
    return this.request('change-password', sessionResultSchema, {
      body: JSON.stringify(input),
      headers: { Authorization: `Bearer ${sessionToken}` },
      method: 'POST',
    });
  }

  async logout(sessionToken: string): Promise<void> {
    await this.request('logout', z.undefined(), {
      headers: { Authorization: `Bearer ${sessionToken}` },
      method: 'POST',
    });
  }

  private async request<T>(
    action: string,
    schema: z.ZodType<T>,
    init: { body?: string; headers?: Record<string, string>; method: 'GET' | 'POST' },
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        new URL(`/v1/internal/student/auth/${action}`, this.config.coreUrl).toString(),
        {
          cache: 'no-store',
          ...(init.body === undefined ? {} : { body: init.body }),
          headers: {
            accept: 'application/json',
            ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
            'x-student-bff-secret': this.config.studentBffSecret,
            ...init.headers,
          },
          method: init.method,
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch (cause: unknown) {
      throw new StudentAuthCoreError('AUTH_SERVICE_UNAVAILABLE', 503, { cause });
    }

    if (!response.ok) {
      let code = 'AUTH_SERVICE_UNAVAILABLE';
      try {
        code = errorSchema.parse(await response.json()).error.code;
      } catch {
        // Core error bodies are intentionally reduced to a stable fallback.
      }
      throw new StudentAuthCoreError(code, response.status);
    }

    if (response.status === 204) {
      return schema.parse(undefined);
    }
    try {
      return schema.parse(await response.json());
    } catch (cause: unknown) {
      throw new StudentAuthCoreError('AUTH_SERVICE_UNAVAILABLE', 503, { cause });
    }
  }
}
