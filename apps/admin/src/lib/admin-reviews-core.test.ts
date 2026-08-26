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
              authorKind: 'student_submission',
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

  it('loads a Published correction base and saves a separate pending Revision', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...revision(), status: 'approved', version: 2 }))
      .mockResolvedValueOnce(
        Response.json({
          outcome: 'created',
          revision: {
            ...revision(),
            authorKind: 'admin_correction',
            publicId: '77000000-0000-4000-8000-000000000009',
          },
        }),
      );
    const client = new AdminReviewsCoreClient(config, fetchMock);
    await client.getCorrectionBase('opaque-admin-session', '77000000-0000-4000-8000-000000000002');
    await client.createCorrection('opaque-admin-session', '77000000-0000-4000-8000-000000000002', {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียด',
      expectedPublishedRevisionId: REVISION_PUBLIC_ID,
      expectedRevisionVersion: 2,
      idempotencyKey: '77000000-0000-4000-8000-000000000008',
      links: [],
      reason: 'แก้ไขข้อความที่คลาดเคลื่อนจากผลงานจริง',
      summary: 'สรุปใหม่',
      tags: [],
      title: 'ชื่อผลงาน',
      videoLinks: [],
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://core.example.test/v1/internal/admin/works/77000000-0000-4000-8000-000000000002/correction-base',
      'https://core.example.test/v1/internal/admin/works/77000000-0000-4000-8000-000000000002/corrections',
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      reason: 'แก้ไขข้อความที่คลาดเคลื่อนจากผลงานจริง',
      summary: 'สรุปใหม่',
    });
  });

  it('uses bounded recovery queue and explicit optimistic recovery commands', async () => {
    const workPublicId = '77000000-0000-4000-8000-000000000002';
    const requestPublicId = '77000000-0000-4000-8000-000000000010';
    const requestItem = removalRequest(requestPublicId, workPublicId);
    const workState = recoveryState(workPublicId);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [requestItem] }))
      .mockResolvedValueOnce(Response.json(workState))
      .mockResolvedValueOnce(
        Response.json({
          outcome: 'transitioned',
          work: { ...workState, publicationState: 'unpublished', version: 2 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          outcome: 'resolved',
          request: { ...requestItem, state: 'declined', version: 2 },
        }),
      );
    const client = new AdminReviewsCoreClient(config, fetchMock);

    await client.listRemovalRequests('opaque-admin-session', 20);
    await client.getRecoveryState('opaque-admin-session', workPublicId);
    await client.transitionWork('opaque-admin-session', workPublicId, {
      expectedVersion: 1,
      idempotencyKey: '77000000-0000-4000-8000-000000000011',
      operation: 'unpublish',
      reason: 'เหตุผลการระงับการเผยแพร่ชั่วคราว',
    });
    await client.decideRemovalRequest('opaque-admin-session', requestPublicId, {
      decision: 'decline',
      decisionReason: 'ยังไม่มีเหตุผลเพียงพอให้นำออก',
      expectedVersion: 1,
      expectedWorkVersion: 1,
      idempotencyKey: '77000000-0000-4000-8000-000000000012',
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://core.example.test/v1/internal/admin/removal-requests?limit=20',
      `https://core.example.test/v1/internal/admin/works/${workPublicId}/recovery-state`,
      `https://core.example.test/v1/internal/admin/works/${workPublicId}/recovery`,
      `https://core.example.test/v1/internal/admin/removal-requests/${requestPublicId}/decision`,
    ]);
  });
  it('lists and decides External Contributor attribution removal requests', async () => {
    const request = {
      attributionName: 'Alex Example',
      correctionRevisionPublicId: null,
      createdAt: '2026-08-26T05:00:00.000Z',
      publicId: '77000000-0000-4000-8000-000000000021',
      reason: 'ขอถอนชื่อออกจากผลงานนี้',
      revisionPublicId: REVISION_PUBLIC_ID,
      state: 'pending',
      version: 1,
      workPublicId: '77000000-0000-4000-8000-000000000022',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [request] }))
      .mockResolvedValueOnce(
        Response.json({
          outcome: 'resolved',
          request: {
            ...request,
            correctionRevisionPublicId: '77000000-0000-4000-8000-000000000023',
            state: 'accepted',
            version: 2,
          },
        }),
      );
    const client = new AdminReviewsCoreClient(config, fetchMock);
    await client.listAttributionRemovalRequests('opaque-admin-session', 20);
    await client.decideAttributionRemovalRequest('opaque-admin-session', request.publicId, {
      decision: 'accept',
      expectedVersion: 1,
      idempotencyKey: '77000000-0000-4000-8000-000000000024',
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://core.example.test/v1/internal/admin/attribution-removal-requests?limit=20',
      `https://core.example.test/v1/internal/admin/attribution-removal-requests/${request.publicId}/decision`,
    ]);
  });
});

function recoveryState(workPublicId: string) {
  return {
    activityState: 'active' as const,
    publicationState: 'published' as const,
    publicId: workPublicId,
    publishedRevisionId: '77000000-0000-4000-8000-000000000013',
    publishedRevisionPublicId: REVISION_PUBLIC_ID,
    version: 1,
  };
}

function removalRequest(publicId: string, workPublicId: string) {
  return {
    createdAt: '2026-08-26T05:00:00.000Z',
    decisionReason: null,
    publicId,
    reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
    revisionPublicId: REVISION_PUBLIC_ID,
    state: 'pending' as const,
    title: 'ชื่อผลงาน',
    version: 1,
    workVersion: 1,
    workPublicId,
  };
}

function revision() {
  return {
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
