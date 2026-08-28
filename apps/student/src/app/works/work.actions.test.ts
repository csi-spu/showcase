import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  authorizeMediaUpload: vi.fn(),
  readStudentSessionToken: vi.fn(),
  revalidatePath: vi.fn(),
  submitRevision: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: dependencies.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.example.test',
    studentBffSecret: 'student-bff-secret-at-least-32-characters',
    visitorUrl: 'https://visitor.example.test',
  }),
}));
vi.mock('@/lib/student-auth-session', () => ({
  readStudentSessionToken: dependencies.readStudentSessionToken,
}));
vi.mock('@/lib/student-works-core', () => {
  class StudentWorksCoreError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }

  return {
    StudentWorksCoreClient: class {
      authorizeMediaUpload = dependencies.authorizeMediaUpload;
      submitRevision = dependencies.submitRevision;
    },
    StudentWorksCoreError,
  };
});

import { StudentWorksCoreError } from '@/lib/student-works-core';
import { submitWorkRevisionAction, uploadWorkMediaAction } from './work.actions';

describe('uploadWorkMediaAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readStudentSessionToken.mockResolvedValue('student-session');
    dependencies.authorizeMediaUpload.mockResolvedValue({
      assetId: '64000000-0000-4000-8000-000000000003',
      expiresAt: '2026-08-28T12:10:00.000Z',
      headers: { 'content-type': 'image/png' },
      status: 'pending_upload',
      uploadUrl: 'https://r2.example.test/presigned',
    });
  });

  it('keeps the route public ID out of the strict Core request body', async () => {
    const publicId = 'b245cce8-fd4b-4ece-ba6b-8f776733a2bb';

    await uploadWorkMediaAction({
      byteSize: 1_029_746,
      contentType: 'image/png',
      fileExtension: 'png',
      idempotencyKey: '80499b6d-2676-4f1f-b088-9ebf29c2f2cc',
      mediaKind: 'poster',
      publicId,
    });

    expect(dependencies.authorizeMediaUpload).toHaveBeenCalledWith('student-session', publicId, {
      byteSize: 1_029_746,
      contentType: 'image/png',
      fileExtension: 'png',
      idempotencyKey: '80499b6d-2676-4f1f-b088-9ebf29c2f2cc',
      mediaKind: 'poster',
    });
  });
});

describe('submitWorkRevisionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readStudentSessionToken.mockResolvedValue('student-session');
  });

  it('reports a Core timeout as a connection error', async () => {
    dependencies.submitRevision.mockRejectedValue(
      new StudentWorksCoreError('AUTH_SERVICE_UNAVAILABLE', 503),
    );
    const formData = new FormData();
    formData.set('attributionName', 'ชื่อผู้ส่ง');
    formData.set('expectedBasePublishedRevisionId', '');
    formData.set('expectedDraftVersion', '1');
    formData.set('idempotencyKey', '42ac8358-b4d1-421f-b4c3-dc5064dcc07f');
    formData.set('studyYear', '2');

    await expect(
      submitWorkRevisionAction(
        'b245cce8-fd4b-4ece-ba6b-8f776733a2bb',
        {
          error: null,
          idempotencyKey: '42ac8358-b4d1-421f-b4c3-dc5064dcc07f',
          success: false,
        },
        formData,
      ),
    ).resolves.toMatchObject({ error: 'network', success: false });
  });

  it('treats an existing pending Revision as the successful submit outcome', async () => {
    dependencies.submitRevision.mockRejectedValue(
      new StudentWorksCoreError('WORK_PENDING_REVISION_EXISTS', 409),
    );
    const formData = new FormData();
    formData.set('attributionName', 'ชื่อผู้ส่ง');
    formData.set('expectedBasePublishedRevisionId', '');
    formData.set('expectedDraftVersion', '1');
    formData.set('idempotencyKey', '42ac8358-b4d1-421f-b4c3-dc5064dcc07f');
    formData.set('studyYear', '2');

    await expect(
      submitWorkRevisionAction(
        'b245cce8-fd4b-4ece-ba6b-8f776733a2bb',
        {
          error: null,
          idempotencyKey: '42ac8358-b4d1-421f-b4c3-dc5064dcc07f',
          success: false,
        },
        formData,
      ),
    ).resolves.toMatchObject({ error: null, success: true });
    expect(dependencies.revalidatePath).toHaveBeenCalledWith(
      '/works/b245cce8-fd4b-4ece-ba6b-8f776733a2bb',
    );
  });
});
