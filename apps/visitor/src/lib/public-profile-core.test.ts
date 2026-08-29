import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicProfileCoreClient } from './public-profile-core';

const PUBLIC_ID = '81000000-0000-4000-8000-000000000001';

describe('PublicProfileCoreClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts only the safe public projection and sends no authentication data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        bio: null,
        entryYear: 2569,
        firstName: 'ณัฐดนัย',
        lastName: 'สุขใจ',
        links: [],
        photo: null,
        publicId: PUBLIC_ID,
      }),
    );
    const client = new PublicProfileCoreClient('https://core.example.test', fetchMock);

    await expect(client.getProfile(PUBLIC_ID)).resolves.toMatchObject({ publicId: PUBLIC_ID });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://core.example.test/v1/public/profiles/${PUBLIC_ID}`);
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(init?.cache).toBe('no-store');
  });

  it('maps every public not-found response to null', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: { code: 'PUBLIC_PROFILE_NOT_FOUND' } }, { status: 404 }),
      );
    const client = new PublicProfileCoreClient('https://core.example.test', fetchMock);
    await expect(client.getProfile(PUBLIC_ID)).resolves.toBeNull();
  });

  it('rejects accidental Account or private draft fields from Core', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        accountId: 'private',
        bio: null,
        entryYear: 2569,
        firstName: 'ณัฐดนัย',
        lastName: 'สุขใจ',
        links: [],
        photo: null,
        publicId: PUBLIC_ID,
      }),
    );
    const client = new PublicProfileCoreClient('https://core.example.test', fetchMock);
    await expect(client.getProfile(PUBLIC_ID)).rejects.toThrow();
  });
});
