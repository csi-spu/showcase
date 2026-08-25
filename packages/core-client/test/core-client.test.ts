import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CoreClient, CoreClientError } from '../src/core-client';

const resultSchema = z.object({ state: z.literal('active') }).strict();

function client(fetchImpl: typeof fetch, timeoutMilliseconds = 5_000) {
  return new CoreClient({
    baseUrl: 'https://core.example.test',
    credential: {
      headerName: 'x-test-bff-secret',
      value: 'server-only-secret',
    },
    fetchImpl,
    timeoutMilliseconds,
  });
}

describe('CoreClient', () => {
  it('validates a successful response and carries server credentials and bearer session', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ state: 'active' }));

    await expect(
      client(fetchMock).request({
        body: { value: 'safe' },
        headers: {
          authorization: 'Bearer caller-controlled-value',
          'x-client-address': '192.0.2.10',
          'X-Test-Bff-Secret': 'caller-controlled-value',
        },
        method: 'POST',
        path: '/v1/internal/example',
        responseSchema: resultSchema,
        sessionToken: 'opaque-session-token',
      }),
    ).resolves.toEqual({ state: 'active' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/v1/internal/example',
      expect.objectContaining({
        body: JSON.stringify({ value: 'safe' }),
        cache: 'no-store',
        credentials: 'omit',
        method: 'POST',
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeInstanceOf(Headers);
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(Object.fromEntries(requestHeaders.entries())).toEqual({
      accept: 'application/json',
      authorization: 'Bearer opaque-session-token',
      'content-type': 'application/json',
      'x-client-address': '192.0.2.10',
      'x-test-bff-secret': 'server-only-secret',
    });
  });

  it('validates stable Core errors and preserves rate-limit retry metadata', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { headers: { 'Retry-After': '37' }, status: 429 },
        ),
      );

    await expect(
      client(fetchMock).request({
        method: 'GET',
        path: '/v1/internal/example',
        responseSchema: resultSchema,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSeconds: 37 }));
  });

  it.each([
    ['malformed success', Response.json({ state: 'unexpected' })],
    ['malformed error', Response.json({ secret: 'provider detail' }, { status: 502 })],
  ])('maps %s responses to a stable unavailable error', async (_case, response) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(
      client(fetchMock).request({
        method: 'GET',
        path: '/v1/internal/example',
        responseSchema: resultSchema,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'AUTH_SERVICE_UNAVAILABLE', status: 503 }));
  });

  it('supports 204 responses through an explicit undefined schema', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      client(fetchMock).request({
        method: 'POST',
        path: '/v1/internal/example/logout',
        responseSchema: z.undefined(),
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects cross-origin paths before attaching server credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      client(fetchMock).request({
        method: 'GET',
        path: '//attacker.example.test/collect',
        responseSchema: resultSchema,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'AUTH_SERVICE_UNAVAILABLE', status: 503 }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'caller cancellation'] as const)(
    'maps %s to an unavailable error',
    async (kind) => {
      const caller = new AbortController();
      const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new Error('Request aborted'));
            },
            { once: true },
          );
        });
      });
      const request = client(fetchMock, kind === 'timeout' ? 1 : 5_000).request({
        method: 'GET',
        path: '/v1/internal/example',
        responseSchema: resultSchema,
        ...(kind === 'caller cancellation' ? { signal: caller.signal } : {}),
      });
      if (kind === 'caller cancellation') {
        caller.abort();
      }

      await expect(request).rejects.toBeInstanceOf(CoreClientError);
      await expect(request).rejects.toEqual(
        expect.objectContaining({ code: 'AUTH_SERVICE_UNAVAILABLE', status: 503 }),
      );
    },
  );
});
