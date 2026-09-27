// @vitest-environment node
import { CoreClientError } from '@showcase/core-client';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstructorCollectionForm } from '@/lib/instructor-collection-forms-contract';

const services = vi.hoisted(() => ({
  list: vi.fn(),
  readInstructorSessionToken: vi.fn(),
}));

vi.mock('@/lib/instructor-auth-session', () => ({
  readInstructorSessionToken: services.readInstructorSessionToken,
}));
vi.mock('@/lib/instructor-collection-forms-core', () => ({
  InstructorCollectionFormsCoreClient: class {
    list = services.list;
  },
}));
vi.mock('@/lib/server-environment', () => ({
  getInstructorServerEnvironment: () => ({
    coreUrl: 'https://core.example.test',
    instructorBffSecret: 'test-secret',
    studentCollectionUrl: 'https://collect.example.test',
  }),
}));

import { GET } from './route';

const GROUP_ID = '0b1f5a9e-6c1d-4f7a-8e2b-3c4d5e6f7a8b';
const FORM_ID = '8d7f4c1e-2b6a-4f3d-9e5c-1a2b3c4d5e6f';
const STUDENT_LINK = `https://collect.example.test/forms/${FORM_ID}`;

function form(overrides: Partial<InstructorCollectionForm> = {}): InstructorCollectionForm {
  return {
    createdFromTemplateId: null,
    deadlineAt: null,
    description: '',
    fields: [],
    groupId: GROUP_ID,
    id: FORM_ID,
    status: 'open',
    title: 'เอกสารฝึกงาน',
    version: 2,
    ...overrides,
  };
}

function request(groupId = GROUP_ID, formId = FORM_ID): Promise<Response> {
  return GET(
    new Request(`https://instructor.example.test/groups/${groupId}/forms/${formId}/qr-code`),
    {
      params: Promise.resolve({ formId, groupId }),
    },
  );
}

describe('GET /groups/[groupId]/forms/[formId]/qr-code', () => {
  beforeEach(() => {
    services.list.mockReset();
    services.readInstructorSessionToken.mockReset();
    services.readInstructorSessionToken.mockResolvedValue('session-token');
  });

  it.each(['open', 'closed'] as const)(
    'serves a PNG attachment of the Student link for a %s form',
    async (status) => {
      services.list.mockResolvedValue([form({ status })]);

      const response = await request();

      expect(services.list).toHaveBeenCalledWith('session-token', GROUP_ID);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="qr-${FORM_ID}.png"; filename*=UTF-8''${encodeURIComponent('qr-เอกสารฝึกงาน.png')}`,
      );

      const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
      expect(png.width).toBe(1024);
      const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      expect(decoded?.data).toBe(STUDENT_LINK);
    },
  );

  it('escapes title characters that would end the encoded file name', async () => {
    services.list.mockResolvedValue([form({ title: "Intern's report (v2)" })]);

    const response = await request();

    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="qr-${FORM_ID}.png"; filename*=UTF-8''qr-Intern%27s%20report%20%28v2%29.png`,
    );
  });

  it('serves nothing for a draft form, which no Student can open yet', async () => {
    services.list.mockResolvedValue([form({ status: 'draft' })]);

    const response = await request();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).not.toBe('image/png');
  });

  it('serves nothing for a form that is not in the given group', async () => {
    services.list.mockResolvedValue([form({ id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' })]);

    expect((await request()).status).toBe(404);
  });

  it('serves nothing for a missing group', async () => {
    services.list.mockRejectedValue(new CoreClientError('GROUP_NOT_FOUND', 404));

    expect((await request()).status).toBe(404);
  });

  it('serves nothing without an Instructor session', async () => {
    services.readInstructorSessionToken.mockResolvedValue(null);

    const response = await request();

    expect(response.status).toBe(401);
    expect(services.list).not.toHaveBeenCalled();
  });

  it('serves nothing once Core reports the session expired', async () => {
    services.list.mockRejectedValue(new CoreClientError('SESSION_EXPIRED', 401));

    expect((await request()).status).toBe(401);
  });

  it('never serves a QR code for a form Core could not verify', async () => {
    services.list.mockRejectedValue(new CoreClientError('CORE_UNAVAILABLE', 503));

    await expect(request()).rejects.toThrow('CORE_UNAVAILABLE');
  });
});
