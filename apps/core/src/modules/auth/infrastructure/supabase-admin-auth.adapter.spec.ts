import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { SupabaseAdminAuthAdapter } from './supabase-admin-auth.adapter';

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe('SupabaseAdminAuthAdapter', () => {
  it('creates a confirmed provider identity through the server-only Admin API', async () => {
    const received: Array<{
      apikey: string | undefined;
      authorization: string | undefined;
      body: unknown;
      method: string | undefined;
      url: string | undefined;
    }> = [];
    const server = createServer((request, response) => {
      void readJson(request).then((body) => {
        received.push({
          apikey: request.headers.apikey as string | undefined,
          authorization: request.headers.authorization,
          body,
          method: request.method,
          url: request.url,
        });
        sendJson(response, 200, { id: '40000000-0000-4000-8000-000000000001' });
      });
    });
    const baseUrl = await listen(server);
    const adapter = new SupabaseAdminAuthAdapter({
      baseUrl,
      secretKey: 'test-secret-key',
      timeoutMilliseconds: 1_000,
    });

    await expect(
      adapter.createIdentity({
        password: 'random-temporary-password-value',
        syntheticIdentity: `${'a'.repeat(64)}@admin.auth.invalid`,
      }),
    ).resolves.toEqual({ providerUserId: '40000000-0000-4000-8000-000000000001' });
    expect(received).toEqual([
      {
        apikey: 'test-secret-key',
        authorization: undefined,
        body: {
          email: `${'a'.repeat(64)}@admin.auth.invalid`,
          email_confirm: true,
          password: 'random-temporary-password-value',
        },
        method: 'POST',
        url: '/auth/v1/admin/users',
      },
    ]);
    await close(server);
  });

  it('deletes a partially provisioned identity with bounded retry', async () => {
    let attempt = 0;
    const server = createServer((_request, response) => {
      attempt += 1;
      sendJson(response, attempt === 1 ? 503 : 200, {});
    });
    const adapter = new SupabaseAdminAuthAdapter({
      baseUrl: await listen(server),
      secretKey: 'test-secret-key',
      timeoutMilliseconds: 1_000,
    });

    await expect(
      adapter.deleteIdentity('40000000-0000-4000-8000-000000000001'),
    ).resolves.toBeUndefined();
    expect(attempt).toBe(2);
    await close(server);
  });

  it.each([
    ['provider rejection', 422, { message: 'sensitive provider detail' }],
    ['malformed success', 200, { email: 'identity-detail@admin.auth.invalid' }],
  ])('maps %s to one detail-free failure', async (_case, status, body) => {
    const server = createServer((_request, response) => sendJson(response, status, body));
    const adapter = new SupabaseAdminAuthAdapter({
      baseUrl: await listen(server),
      secretKey: 'test-secret-key',
      timeoutMilliseconds: 1_000,
    });

    await expect(
      adapter.createIdentity({
        password: 'random-temporary-password-value',
        syntheticIdentity: `${'a'.repeat(64)}@admin.auth.invalid`,
      }),
    ).rejects.toThrow('ADMIN_PROVIDER_UNAVAILABLE');
    await close(server);
  });

  it('maps create transport failures to one detail-free failure', async () => {
    const adapter = new SupabaseAdminAuthAdapter({
      baseUrl: 'http://127.0.0.1:1',
      secretKey: 'test-secret-key',
      timeoutMilliseconds: 100,
    });

    await expect(
      adapter.createIdentity({
        password: 'random-temporary-password-value',
        syntheticIdentity: `${'a'.repeat(64)}@admin.auth.invalid`,
      }),
    ).rejects.toThrow('ADMIN_PROVIDER_UNAVAILABLE');
  });

  it('bounds failed delete retries and reports cleanup failure', async () => {
    let attempt = 0;
    const server = createServer((_request, response) => {
      attempt += 1;
      sendJson(response, 503, { message: 'sensitive provider detail' });
    });
    const adapter = new SupabaseAdminAuthAdapter({
      baseUrl: await listen(server),
      secretKey: 'test-secret-key',
      timeoutMilliseconds: 1_000,
    });

    await expect(adapter.deleteIdentity('40000000-0000-4000-8000-000000000001')).rejects.toThrow(
      'ADMIN_PROVIDER_UNAVAILABLE',
    );
    expect(attempt).toBe(2);
    await close(server);
  });

  it('maps delete transport failures after two bounded attempts', async () => {
    const adapter = new SupabaseAdminAuthAdapter({
      baseUrl: 'http://127.0.0.1:1',
      secretKey: 'test-secret-key',
      timeoutMilliseconds: 100,
    });

    await expect(adapter.deleteIdentity('40000000-0000-4000-8000-000000000001')).rejects.toThrow(
      'ADMIN_PROVIDER_UNAVAILABLE',
    );
  });
});
