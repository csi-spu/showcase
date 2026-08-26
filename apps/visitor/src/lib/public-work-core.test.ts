import { describe, expect, it, vi } from 'vitest';
import { PublicWorkCoreClient } from './public-work-core';

const WORK_PUBLIC_ID = '86000000-0000-4000-8000-000000000001';
const ASSET_ID = '86000000-0000-4000-8000-000000000002';

describe('PublicWorkCoreClient', () => {
  it('retrieves the privacy-safe Published Revision through its stable public URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(publicWork()));
    const work = await new PublicWorkCoreClient('https://core.example.test', fetchMock).getWork(
      WORK_PUBLIC_ID,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://core.example.test/v1/public/works/${WORK_PUBLIC_ID}`,
    );
    expect(work).toEqual(publicWork());
    expect(JSON.stringify(work)).not.toMatch(/studentId|accountId|personId|session/i);
  });

  it('uses uniform not-found semantics before approval', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: { code: 'PUBLIC_WORK_NOT_FOUND' } }, { status: 404 }),
      );
    await expect(
      new PublicWorkCoreClient('https://core.example.test', fetchMock).getWork(WORK_PUBLIC_ID),
    ).resolves.toBeNull();
  });
});

function publicWork() {
  return {
    academicPeriod: { semester: '1', year: 2569 },
    attributions: [
      {
        affiliation: null,
        attributionName: 'ชื่อผู้ส่ง',
        contributionRole: null,
        profilePublicId: '86000000-0000-4000-8000-000000000003',
        studyYear: 2,
      },
    ],
    category: 'course_work',
    description: 'รายละเอียดผลงาน',
    links: [{ label: 'เว็บไซต์', url: 'https://example.com/work' }],
    media: [
      {
        assetId: ASSET_ID,
        dominantColor: '#285078',
        height: 1800,
        kind: 'poster',
        position: 1,
        variants: [{ height: 720, width: 480 }],
        width: 1200,
      },
    ],
    publishedAt: '2026-08-25T18:00:00.000Z',
    revisionNumber: 1,
    summary: 'สรุปผลงาน',
    tags: [{ displayLabel: 'React', publicId: '86000000-0000-4000-8000-000000000004' }],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
    workPublicId: WORK_PUBLIC_ID,
  };
}
