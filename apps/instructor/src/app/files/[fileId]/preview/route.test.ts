// @vitest-environment node
import { CoreClientError } from '@showcase/core-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  createPreview: vi.fn(),
  readInstructorSessionToken: vi.fn(),
}));

vi.mock('@/lib/instructor-auth-session', () => ({
  readInstructorSessionToken: services.readInstructorSessionToken,
}));
vi.mock('@/lib/instructor-collection-forms-core', () => ({
  InstructorCollectionFormsCoreClient: class {
    createPreview = services.createPreview;
  },
}));
vi.mock('@/lib/server-environment', () => ({
  getInstructorServerEnvironment: () => ({
    coreUrl: 'https://core.example.test',
    instructorBffSecret: 'test-secret',
  }),
}));

import { GET } from './route';

const FILE_ID = '30000000-0000-4000-8000-000000000001';
const PREVIEW_URL = 'https://r2.example.test/poster?signature=x';
const upstreamFetch = vi.fn<typeof fetch>();

function request(): Promise<Response> {
  return GET(new Request(`https://instructor.example.test/files/${FILE_ID}/preview`), {
    params: Promise.resolve({ fileId: FILE_ID }),
  });
}

describe('GET /files/[fileId]/preview', () => {
  beforeEach(() => {
    services.readInstructorSessionToken.mockResolvedValue('session-token');
    services.createPreview.mockResolvedValue({ contentType: 'image/png', previewUrl: PREVIEW_URL });
    upstreamFetch.mockResolvedValue(new Response('png-bytes', { status: 200 }));
    vi.stubGlobal('fetch', upstreamFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('serves the image as the type Core detected, inline and never cached', async () => {
    const response = await request();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('png-bytes');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(services.createPreview).toHaveBeenCalledWith('session-token', FILE_ID);
    expect(upstreamFetch).toHaveBeenCalledWith(
      PREVIEW_URL,
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
    );
  });

  it('refuses without a session before asking Core', async () => {
    services.readInstructorSessionToken.mockResolvedValue(null);

    expect((await request()).status).toBe(401);
    expect(services.createPreview).not.toHaveBeenCalled();
  });

  it('answers an expired session as unauthenticated', async () => {
    services.createPreview.mockRejectedValue(new CoreClientError('SESSION_EXPIRED', 401));

    expect((await request()).status).toBe(401);
  });

  it.each(['FILE_NOT_FOUND', 'FILE_NOT_READY', 'FILE_NOT_PREVIEWABLE'])(
    'answers %s as not found, so the page falls back to its download link',
    async (code) => {
      services.createPreview.mockRejectedValue(new CoreClientError(code, 404));

      const response = await request();
      expect(response.status).toBe(404);
      expect(upstreamFetch).not.toHaveBeenCalled();
    },
  );

  it('refuses an image larger than the per-file ceiling', async () => {
    upstreamFetch.mockResolvedValue(
      new Response('png-bytes', { headers: { 'content-length': '10000001' }, status: 200 }),
    );

    expect((await request()).status).toBe(404);
  });

  it('answers a storage failure as not found', async () => {
    upstreamFetch.mockResolvedValue(new Response(null, { status: 503 }));

    expect((await request()).status).toBe(404);
  });
});
