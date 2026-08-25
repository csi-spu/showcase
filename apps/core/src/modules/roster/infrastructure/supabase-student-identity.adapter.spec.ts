import { SupabaseStudentIdentityAdapter } from './supabase-student-identity.adapter';

const PROVIDER_USER_ID = '69000000-0000-5000-8000-000000000001';
const SYNTHETIC_IDENTITY = `${'a'.repeat(64)}@auth.invalid`;

describe('SupabaseStudentIdentityAdapter', () => {
  it('creates the deterministic Auth identity with the Student ID as initial password', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(Response.json({ email: SYNTHETIC_IDENTITY, id: PROVIDER_USER_ID }));
    const adapter = createAdapter(fetchMock);

    await adapter.ensureIdentity({
      password: '69000001',
      providerUserId: PROVIDER_USER_ID,
      syntheticIdentity: SYNTHETIC_IDENTITY,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://supabase.example.test/auth/v1/admin/users',
      expect.objectContaining({
        body: JSON.stringify({
          email: SYNTHETIC_IDENTITY,
          email_confirm: true,
          id: PROVIDER_USER_ID,
          password: '69000001',
        }),
        method: 'POST',
      }),
    );
  });

  it('converges after a crash by verifying the same deterministic identity', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(Response.json({ code: 'email_exists' }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ email: SYNTHETIC_IDENTITY, id: PROVIDER_USER_ID }));
    const adapter = createAdapter(fetchMock);

    await expect(
      adapter.ensureIdentity({
        password: '69000001',
        providerUserId: PROVIDER_USER_ID,
        syntheticIdentity: SYNTHETIC_IDENTITY,
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `https://supabase.example.test/auth/v1/admin/users/${PROVIDER_USER_ID}`,
    );
  });

  it('rejects a deterministic ID occupied by a different identity', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(Response.json({ code: 'conflict' }, { status: 422 }))
      .mockResolvedValueOnce(
        Response.json({ email: `${'b'.repeat(64)}@auth.invalid`, id: PROVIDER_USER_ID }),
      );
    const adapter = createAdapter(fetchMock);

    await expect(
      adapter.ensureIdentity({
        password: '69000001',
        providerUserId: PROVIDER_USER_ID,
        syntheticIdentity: SYNTHETIC_IDENTITY,
      }),
    ).rejects.toThrow('ROSTER_AUTH_PROVIDER_UNAVAILABLE');
  });

  it('bounds and retries a transient provider request failure', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce(Response.json({ email: SYNTHETIC_IDENTITY, id: PROVIDER_USER_ID }));
    const adapter = createAdapter(fetchMock);

    await expect(
      adapter.ensureIdentity({
        password: '69000001',
        providerUserId: PROVIDER_USER_ID,
        syntheticIdentity: SYNTHETIC_IDENTITY,
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function createAdapter(fetchImpl: typeof fetch): SupabaseStudentIdentityAdapter {
  return new SupabaseStudentIdentityAdapter(
    {
      baseUrl: 'https://supabase.example.test',
      secretKey: 'test-secret-key',
      timeoutMilliseconds: 1_000,
    },
    fetchImpl,
  );
}
