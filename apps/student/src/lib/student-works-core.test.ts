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
    },
    publicationState: 'never_published' as const,
    publicId: PUBLIC_ID,
    version: 1,
  };
}
