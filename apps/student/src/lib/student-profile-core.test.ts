import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentProfileCoreClient } from './student-profile-core';

const SESSION = 'opaque-session';
const PROFILE_ID = '71000000-0000-4000-8000-000000000001';

describe('StudentProfileCoreClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads a private profile through the server-only BFF contract', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        canEditProfile: true,
        profile: {
          bio: null,
          consent: null,
          displayName: 'ณัฐดนัย',
          entryYear: 2569,
          links: [],
          photo: null,
          photoId: null,
          publicId: PROFILE_ID,
          version: 1,
        },
      }),
    );
    const client = createClient(fetchMock);

    await expect(client.getProfile(SESSION)).resolves.toMatchObject({
      canEditProfile: true,
      profile: { publicId: PROFILE_ID },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://core.example.test/v1/internal/student/profile');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SESSION}`);
    expect(new Headers(init?.headers).get('x-student-bff-secret')).toBe('server-secret');
  });

  it('updates bounded profile fields without Account or Student ID data', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ outcome: 'updated' }));
    const client = createClient(fetchMock);
    await client.updateProfile(SESSION, {
      bio: null,
      displayName: 'ณัฐดนัย',
      expectedVersion: 1,
      idempotencyKey: '71000000-0000-4000-8000-000000000002',
      links: [],
      photoId: null,
    });

    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(JSON.parse(body)).toEqual({
      bio: null,
      displayName: 'ณัฐดนัย',
      expectedVersion: 1,
      idempotencyKey: '71000000-0000-4000-8000-000000000002',
      links: [],
      photoId: null,
    });
    expect(body).not.toMatch(/studentId|account/i);
  });

  function createClient(fetchImpl: typeof fetch) {
    return new StudentProfileCoreClient(
      { coreUrl: 'https://core.example.test', studentBffSecret: 'server-secret' },
      fetchImpl,
    );
  }
});
