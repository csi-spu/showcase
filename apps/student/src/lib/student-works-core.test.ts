import { describe, expect, it, vi } from 'vitest';
import { StudentWorksCoreClient } from './student-works-core';
const SESSION = 'opaque-session';
const PUBLIC_ID = '64000000-0000-4000-8000-000000000001';

describe('StudentWorksCoreClient', () => {
  it('requests one authoritative workspace summary', async () => {
    const response = {
      canMutate: true,
      changeRequestCount: 1,
      draftCount: 2,
      latestActionableDraftPublicId: PUBLIC_ID,
      pendingReviewCount: 3,
      publishedCount: 4,
      unreadNotificationCount: 5,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    await expect(client(fetchMock).getWorkspaceSummary(SESSION)).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://core.example.test/v1/internal/student/works/workspace-summary',
    );
  });

  it('binds the exact-12 Work page cursor to the selected view', async () => {
    const response = {
      hasNextPage: false,
      hasPreviousPage: false,
      items: [],
      nextCursor: null,
      previousCursor: null,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    await client(fetchMock).listWorks(SESSION, { cursor: 'signed.cursor', view: 'saved' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://core.example.test/v1/internal/student/works?view=saved&cursor=signed.cursor',
    );
  });

  it('uses Student ID only in the private lookup request and accepts a response that cannot echo it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          candidateReference: '64000000-0000-4000-8000-000000000002',
          firstName: 'สมชาย',
          lastName: 'ใจดี',
        }),
      );
    await expect(
      client(fetchMock).lookupContributor(SESSION, PUBLIC_ID, '12345678'),
    ).resolves.toEqual({
      candidateReference: '64000000-0000-4000-8000-000000000002',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      studentId: '12345678',
    });
  });

  it('requests an owner-authorized processed media variant', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ url: 'https://media.example.test/private-variant' }));

    await expect(
      client(fetchMock).getPrivateMediaVariant(
        SESSION,
        PUBLIC_ID,
        '64000000-0000-4000-8000-000000000003',
        768,
      ),
    ).resolves.toEqual({ url: 'https://media.example.test/private-variant' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}/media/64000000-0000-4000-8000-000000000003/variants/768`,
    );
  });
});

function client(fetchImpl: typeof fetch) {
  return new StudentWorksCoreClient(
    { coreUrl: 'https://core.example.test', studentBffSecret: 'server-secret' },
    fetchImpl,
  );
}
