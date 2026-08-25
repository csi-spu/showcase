import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentWorksCoreClient } from './student-works-core';

const SESSION = 'opaque-session';
const PUBLIC_ID = '64000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '64000000-0000-4000-8000-000000000002';

describe('StudentWorksCoreClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads safe authoring bounds and one private Work Draft through the BFF', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ currentAcademicYear: 2569, entryYear: 2566 }))
      .mockResolvedValueOnce(Response.json(work()));
    const client = createClient(fetchMock);

    await expect(client.getAuthoringContext(SESSION)).resolves.toEqual({
      currentAcademicYear: 2569,
      entryYear: 2566,
    });
    await expect(client.getWork(SESSION, PUBLIC_ID)).resolves.toMatchObject({
      publicId: PUBLIC_ID,
      version: 1,
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://core.example.test/v1/internal/student/works/authoring-context',
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SESSION}`);
      expect(new Headers(init?.headers).get('x-student-bff-secret')).toBe('server-secret');
      expect(init?.cache).toBe('no-store');
    }
  });

  it('creates and updates only the generic Work Draft contract', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ outcome: 'created', work: work() }))
      .mockResolvedValueOnce(
        Response.json({ outcome: 'updated', work: { ...work(), version: 2 } }),
      );
    const client = createClient(fetchMock);
    const input = mutationInput();

    await client.createWork(SESSION, input);
    await client.updateWork(SESSION, PUBLIC_ID, { ...input, expectedVersion: 1 });

    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PUT']);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      input,
      { ...input, expectedVersion: 1 },
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => String(init?.body)).join('')).not.toMatch(
      /studentId|accountId|personId|media|contributor/i,
    );
  });

  it('uses exact private Work media contracts through Core', async () => {
    const assetId = '64000000-0000-4000-8000-000000000003';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          assetId,
          expiresAt: '2026-08-25T12:10:00.000Z',
          headers: { 'content-type': 'image/jpeg' },
          status: 'pending_upload',
          uploadUrl: 'https://r2.example.test/presigned',
        }),
      )
      .mockResolvedValueOnce(Response.json({ assetId, status: 'uploaded' }))
      .mockResolvedValueOnce(
        Response.json({
          assetId,
          preview: {
            expiresAt: '2026-08-25T12:10:00.000Z',
            height: 1600,
            url: 'https://r2.example.test/preview',
            width: 1200,
          },
          rejectionCode: null,
          status: 'ready',
          warnings: [],
        }),
      )
      .mockResolvedValueOnce(Response.json({ outcome: 'attached', version: 2 }));
    const client = createClient(fetchMock);

    await client.authorizeMediaUpload(SESSION, PUBLIC_ID, {
      byteSize: 1024,
      contentType: 'image/jpeg',
      fileExtension: 'jpg',
      idempotencyKey: IDEMPOTENCY_KEY,
      mediaKind: 'poster',
    });
    await client.finalizeMediaUpload(SESSION, PUBLIC_ID, assetId);
    await expect(client.getMediaUploadStatus(SESSION, PUBLIC_ID, assetId)).resolves.toMatchObject({
      preview: { width: 1200 },
      status: 'ready',
    });
    await client.attachMedia(SESSION, PUBLIC_ID, {
      assetId,
      expectedVersion: 1,
      mediaKind: 'poster',
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}/media-uploads`,
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}/media-uploads/${assetId}/finalize`,
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}/media-uploads/${assetId}`,
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}/media`,
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      byteSize: 1024,
      contentType: 'image/jpeg',
      fileExtension: 'jpg',
      idempotencyKey: IDEMPOTENCY_KEY,
      mediaKind: 'poster',
    });
  });

  it('uses bounded invitation contracts without exposing Account or Person identifiers', async () => {
    const invitation = {
      affiliation: null,
      attributionName: null,
      contributionRole: null,
      createdAt: '2026-08-25T10:00:00.000Z',
      expiresAt: '2026-09-08T10:00:00.000Z',
      kind: 'account' as const,
      proposedAttributionName: null,
      publicId: '64000000-0000-4000-8000-000000000004',
      state: 'pending' as const,
      studyYear: null,
      version: 1,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [invitation], nextCursor: null }))
      .mockResolvedValueOnce(Response.json({ outcome: 'received' }))
      .mockResolvedValueOnce(Response.json({ outcome: 'accepted' }));
    const client = createClient(fetchMock);

    await expect(client.listReceivedInvitations(SESSION)).resolves.toEqual({
      items: [invitation],
      nextCursor: null,
    });
    await client.createAccountInvitation(SESSION, PUBLIC_ID, {
      idempotencyKey: IDEMPOTENCY_KEY,
      studentId: '69000001',
    });
    await client.transitionAccountInvitation(SESSION, invitation.publicId, 'accept', {
      attributionName: 'ผู้ร่วมผลงาน',
      consent: true,
      expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      studyYear: 4,
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://core.example.test/v1/internal/student/contributor-invitations',
      `https://core.example.test/v1/internal/student/works/${PUBLIC_ID}/contributor-invitations/account`,
      `https://core.example.test/v1/internal/student/contributor-invitations/${invitation.publicId}/accept`,
    ]);
    expect(JSON.stringify(invitation)).not.toMatch(/accountId|personId|studentId/i);
  });
});

function createClient(fetchImpl: typeof fetch) {
  return new StudentWorksCoreClient(
    { coreUrl: 'https://core.example.test', studentBffSecret: 'server-secret' },
    fetchImpl,
  );
}

function mutationInput() {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    category: 'course_work' as const,
    description: 'รายละเอียดผลงาน',
    idempotencyKey: IDEMPOTENCY_KEY,
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
    summary: 'สรุปผลงาน',
    tags: ['React'],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
  };
}

function work() {
  return {
    activityState: 'active' as const,
    basePublishedRevisionId: null,
    draft: {
      academicPeriod: { semester: '1' as const, year: 2569 },
      category: 'course_work' as const,
      description: 'รายละเอียดผลงาน',
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      summary: 'สรุปผลงาน',
      tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
      title: 'ระบบแนะนำผลงาน',
      videoLinks: [],
    },
    publicationState: 'never_published' as const,
    publicId: PUBLIC_ID,
    version: 1,
  };
}
