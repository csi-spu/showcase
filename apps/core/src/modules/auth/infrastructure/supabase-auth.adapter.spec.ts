import { AddressInfo } from 'node:net';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AuthProviderError } from '../application/auth.ports';
import { SupabaseAuthAdapter } from './supabase-auth.adapter';

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function createAsyncServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): Server {
  return createServer((request, response) => {
    void handler(request, response).catch(() => response.destroy());
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

describe('SupabaseAuthAdapter', () => {
  it('authenticates through the password grant without exposing provider response details', async () => {
    const requests: Array<{ authorization: string | undefined; body: unknown; url: string }> = [];
    const server = createAsyncServer(async (request, response) => {
      requests.push({
        authorization: request.headers.authorization,
        body: await readJson(request),
        url: request.url ?? '',
      });
      sendJson(response, 200, {
        access_token: 'provider-access-token',
        expires_at: 1_788_182_400,
        expires_in: 3600,
        refresh_token: 'provider-refresh-token',
        token_type: 'bearer',
        user: { id: '00000000-0000-4000-8000-000000000001' },
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const adapter = new SupabaseAuthAdapter({
      apiKey: 'test-publishable-key',
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMilliseconds: 1_000,
    });

    await expect(adapter.authenticate('student-hash@auth.invalid', '69000001')).resolves.toEqual({
      accessToken: 'provider-access-token',
      expiresAt: new Date('2026-08-31T13:20:00.000Z'),
      providerUserId: '00000000-0000-4000-8000-000000000001',
      refreshToken: 'provider-refresh-token',
    });
    expect(requests).toEqual([
      {
        authorization: undefined,
        body: { email: 'student-hash@auth.invalid', password: '69000001' },
        url: '/auth/v1/token?grant_type=password',
      },
    ]);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('retries one transient refresh failure and rotates provider credentials', async () => {
    let attempt = 0;
    const server = createAsyncServer(async (request, response) => {
      await readJson(request);
      attempt += 1;
      if (attempt === 1) {
        sendJson(response, 503, { message: 'temporary provider detail' });
        return;
      }
      sendJson(response, 200, {
        access_token: 'new-access-token',
        expires_at: 1_788_182_400,
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
        token_type: 'bearer',
        user: { id: '00000000-0000-4000-8000-000000000001' },
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const adapter = new SupabaseAuthAdapter({
      apiKey: 'test-publishable-key',
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMilliseconds: 1_000,
    });

    await expect(adapter.refresh('old-refresh-token')).resolves.toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(attempt).toBe(2);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('maps invalid password responses to a stable provider error without returning its body', async () => {
    const server = createServer((_request, response) => {
      sendJson(response, 400, { message: 'provider says this exact password was wrong' });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const adapter = new SupabaseAuthAdapter({
      apiKey: 'test-publishable-key',
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMilliseconds: 1_000,
    });

    await expect(
      adapter.authenticate('student-hash@auth.invalid', 'wrong-password'),
    ).rejects.toEqual(new AuthProviderError('INVALID_CREDENTIALS'));
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
