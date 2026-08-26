import { describe, expect, it, vi } from 'vitest';
import { AdminReviewsCoreClient } from './admin-reviews-core';

const config = {
  adminBffSecret: 'server-only-admin-secret',
  coreUrl: 'https://core.example.test',
};
const REVISION_PUBLIC_ID = '77000000-0000-4000-8000-000000000001';

describe('AdminReviewsCoreClient', () => {
  it('loads a bounded queue and immutable Revision detail through Core', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              academicPeriod: { semester: '1', year: 2569 },
              category: 'course_work',
              number: 1,
              revisionPublicId: REVISION_PUBLIC_ID,
              submittedAt: '2026-08-25T15:00:00.000Z',
              submitterAttributionName: 'ชื่อผู้ส่ง',
              title: 'ชื่อผลงาน',
              workPublicId: '77000000-0000-4000-8000-000000000002',
            },
          ],
          nextCursor: 'opaque/cursor',
        }),
      )
      .mockResolvedValueOnce(Response.json(revision()));
    const client = new AdminReviewsCoreClient(config, fetchMock);

    await client.listQueue('opaque-admin-session', { cursor: 'opaque/cursor', limit: 20 });
    await client.getRevision('opaque-admin-session', REVISION_PUBLIC_ID);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://core.example.test/v1/internal/admin/review-queue?limit=20&cursor=opaque%2Fcursor',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `https://core.example.test/v1/internal/admin/revisions/${REVISION_PUBLIC_ID}`,
    );
  });

  it('sends the exact optimistic idempotent Change Request contract', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        outcome: 'changed_requested',
        review: changeRequest(),
      }),
    );
    await new AdminReviewsCoreClient(config, fetchMock).requestChanges(
      'opaque-admin-session',
      REVISION_PUBLIC_ID,
      {
        expectedRevisionVersion: 1,
        feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
        idempotencyKey: '77000000-0000-4000-8000-000000000003',
        reason: 'content',
      },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://core.example.test/v1/internal/admin/revisions/${REVISION_PUBLIC_ID}/change-request`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      expectedRevisionVersion: 1,
      feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
      idempotencyKey: '77000000-0000-4000-8000-000000000003',
      reason: 'content',
    });
  });

  it('sends approval as a separate optimistic idempotent command', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        outcome: 'published',
        publication: {
          publishedAt: '2026-08-25T16:00:00.000Z',
          revisionPublicId: REVISION_PUBLIC_ID,
          revisionVersion: 2,
          workPublicId: '77000000-0000-4000-8000-000000000002',
        },
      }),
    );
    await new AdminReviewsCoreClient(config, fetchMock).approveAndPublish(
      'opaque-admin-session',
      REVISION_PUBLIC_ID,
      {
        expectedRevisionVersion: 1,
        idempotencyKey: '77000000-0000-4000-8000-000000000003',
      },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://core.example.test/v1/internal/admin/revisions/${REVISION_PUBLIC_ID}/approve-and-publish`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      expectedRevisionVersion: 1,
      idempotencyKey: '77000000-0000-4000-8000-000000000003',
    });
  });
});

function revision() {
  return {
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
    media: [
      {
        assetId: '77000000-0000-4000-8000-000000000005',
        dominantColor: '#285078',
        height: 1_800,
        kind: 'poster',
        position: 1,
        preview: {
          expiresAt: '2026-08-25T16:10:00.000Z',
          url: 'https://r2.example.test/signed-preview',
        },
        variants: [{ height: 720, width: 480 }],
        width: 1_200,
      },
    ],
    number: 1,
    publicId: REVISION_PUBLIC_ID,
    status: 'pending_review',
    submittedAt: '2026-08-25T15:00:00.000Z',
    version: 1,
    withdrawnAt: null,
    workPublicId: '77000000-0000-4000-8000-000000000002',
  };
}

function changeRequest() {
  return {
    decision: 'changes_requested',
    feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
    publicId: '77000000-0000-4000-8000-000000000004',
    reason: 'content',
    revisionNumber: 1,
    revisionPublicId: REVISION_PUBLIC_ID,
    reviewedAt: '2026-08-25T16:00:00.000Z',
    workPublicId: '77000000-0000-4000-8000-000000000002',
  };
}
