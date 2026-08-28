import { z } from 'zod';

const errorResponseSchema = z
  .object({
    error: z.object({ code: z.string().min(1) }).strict(),
  })
  .strict();

export class CoreClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'CoreClientError';
  }
}

export interface CoreClientConfig {
  baseUrl: string;
  credential: {
    headerName: string;
    value: string;
  };
  fetchImpl?: typeof fetch;
  timeoutMilliseconds?: number;
}

interface CoreRequest<T> {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: `/${string}`;
  rawBody?: BodyInit;
  responseSchema: z.ZodType<T>;
  sessionToken?: string;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}

interface CoreTextRequest {
  method: 'GET';
  path: `/${string}`;
  sessionToken?: string;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}

export class CoreClient {
  private readonly baseOrigin: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly config: CoreClientConfig) {
    this.baseOrigin = new URL(config.baseUrl).origin;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMilliseconds = config.timeoutMilliseconds ?? 5_000;
  }

  async request<T>(input: CoreRequest<T>): Promise<T> {
    const response = await this.execute(input, 'application/json');

    try {
      return input.responseSchema.parse(
        response.status === 204 ? undefined : await response.json(),
      );
    } catch (cause: unknown) {
      throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503, undefined, { cause });
    }
  }

  async requestText(input: CoreTextRequest): Promise<string> {
    const response = await this.execute(input, 'text/csv');
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/csv')) {
      throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503);
    }
    try {
      return await response.text();
    } catch (cause: unknown) {
      throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503, undefined, { cause });
    }
  }

  private async execute(input: CoreRequest<unknown> | CoreTextRequest, accept: string) {
    const url = new URL(input.path, this.baseOrigin);
    if (url.origin !== this.baseOrigin) {
      throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503);
    }

    const timeoutSignal = AbortSignal.timeout(
      input.timeoutMilliseconds ?? this.timeoutMilliseconds,
    );
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    const headers = new Headers('headers' in input ? input.headers : undefined);
    headers.set('accept', accept);
    if (input.sessionToken !== undefined) {
      headers.set('authorization', `Bearer ${input.sessionToken}`);
    }
    const body = 'body' in input ? input.body : undefined;
    const rawBody = 'rawBody' in input ? input.rawBody : undefined;
    if (body !== undefined && rawBody !== undefined) {
      throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503);
    }
    if (body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    headers.set(this.config.credential.headerName, this.config.credential.value);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        ...(rawBody !== undefined
          ? { body: rawBody }
          : body === undefined
            ? {}
            : { body: JSON.stringify(body) }),
        cache: 'no-store',
        credentials: 'omit',
        headers,
        method: input.method,
        signal,
      });
    } catch (cause: unknown) {
      throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503, undefined, { cause });
    }

    if (!response.ok) {
      try {
        const error = errorResponseSchema.parse(await response.json());
        throw new CoreClientError(
          error.error.code,
          response.status,
          this.parseRetryAfter(response.headers.get('retry-after')),
        );
      } catch (cause: unknown) {
        if (cause instanceof CoreClientError) {
          throw cause;
        }
        throw new CoreClientError('AUTH_SERVICE_UNAVAILABLE', 503, undefined, { cause });
      }
    }

    return response;
  }

  private parseRetryAfter(value: string | null): number | undefined {
    if (value === null || !/^\d+$/.test(value)) {
      return undefined;
    }
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
}
