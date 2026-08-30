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

  it('searches Contributor Candidates by name or Student ID without accepting private IDs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          candidateReference: '64000000-0000-4000-8000-000000000002',
          firstName: 'สมชาย',
          lastName: 'ใจดี',
          publicProfile: {
            entryYear: 2566,
            hasPhoto: true,
            publicId: '64000000-0000-4000-8000-000000000003',
          },
        },
      ]),
    );
    await expect(
      client(fetchMock).searchContributorCandidates(SESSION, PUBLIC_ID, '12345678'),
    ).resolves.toEqual([
      {
        candidateReference: '64000000-0000-4000-8000-000000000002',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        publicProfile: {
          entryYear: 2566,
          hasPhoto: true,
          publicId: '64000000-0000-4000-8000-000000000003',
        },
      },
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: '12345678',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/contributor-candidates/search');
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

  it('requests the current Published Revision through the private Student contract', async () => {
    const publishedRevision = {
      authorKind: 'student_submission',
      attributions: [],
      content: {
        academicPeriod: { semester: '1', year: 2569 },
        category: 'course_work',
        description: 'รายละเอียด',
        links: [],
        summary: 'สรุป',
        tags: [],
        title: 'ชื่อผลงาน',
        videoLinks: [],
      },
      media: [],
      number: 2,
      publicId: '64000000-0000-4000-8000-000000000005',
      status: 'approved',
      submittedAt: '2026-08-25T15:00:00.000Z',
      version: 3,
      withdrawnAt: null,
      workPublicId: PUBLIC_ID,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ revision: publishedRevision }));

    await expect(client(fetchMock).getPublishedRevision(SESSION, PUBLIC_ID)).resolves.toEqual(
      publishedRevision,
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}/revisions/published`,
    );
  });

  it('requests bounded Published Tag suggestions through Core', async () => {
    const response = [
      {
        activeWorkCount: 3,
        displayLabel: 'React Native',
        publicId: '64000000-0000-4000-8000-000000000004',
      },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));

    await expect(client(fetchMock).suggestTags(SESSION, 'react')).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://core.example.test/v1/public/tags/suggestions?q=react',
    );
  });
});

function client(fetchImpl: typeof fetch) {
  return new StudentWorksCoreClient(
    { coreUrl: 'https://core.example.test', studentBffSecret: 'server-secret' },
    fetchImpl,
  );
}
