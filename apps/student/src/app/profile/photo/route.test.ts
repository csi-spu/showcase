import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentProfileCoreClient, StudentProfileCoreError } from '@/lib/student-profile-core';
import { GET } from './route';

const routeDependencies = vi.hoisted(() => ({
  readSessionToken: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.example.test',
    studentBffSecret: 'student-bff-secret-with-at-least-32-characters',
    visitorUrl: 'https://visitor.example.test',
  }),
}));
vi.mock('@/lib/student-auth-session', () => ({
  readStudentSessionToken: routeDependencies.readSessionToken,
}));

describe('GET /profile/photo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    routeDependencies.readSessionToken.mockReset();
  });

  it('does not load profile media without an authenticated Student session', async () => {
    routeDependencies.readSessionToken.mockResolvedValue(null);
    const getProfile = vi.spyOn(StudentProfileCoreClient.prototype, 'getProfile');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new Request('http://localhost/profile/photo'));

    expect(response.status).toBe(401);
    expect(getProfile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves only the current Student profile photo as private sanitized WebP', async () => {
    routeDependencies.readSessionToken.mockResolvedValue('session-token');
    mockProfilePhoto();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/webp' },
      }),
    );

    const response = await GET(new Request('http://localhost/profile/photo'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('etag')).toEqual(expect.any(String));
    expect((await response.arrayBuffer()).byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://media.example.test/profile-media/photo.webp',
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
    );
  });

  it.each([
    ['an unexpected media type', { 'Content-Type': 'image/png' }],
    [
      'an oversized declared payload',
      { 'Content-Length': String(8 * 1_024 * 1_024 + 1), 'Content-Type': 'image/webp' },
    ],
  ])('rejects %s', async (_scenario, headers) => {
    routeDependencies.readSessionToken.mockResolvedValue('session-token');
    mockProfilePhoto();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers }),
    );

    const response = await GET(new Request('http://localhost/profile/photo'));

    expect(response.status).toBe(404);
  });

  it('stops reading an undeclared payload that exceeds the private media limit', async () => {
    routeDependencies.readSessionToken.mockResolvedValue('session-token');
    mockProfilePhoto();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(8 * 1_024 * 1_024 + 1), {
        headers: { 'Content-Type': 'image/webp' },
      }),
    );

    const response = await GET(new Request('http://localhost/profile/photo'));

    expect(response.status).toBe(404);
  });

  it('returns unauthenticated when the Core session expires before profile lookup', async () => {
    routeDependencies.readSessionToken.mockResolvedValue('expired-session-token');
    vi.spyOn(StudentProfileCoreClient.prototype, 'getProfile').mockRejectedValue(
      new StudentProfileCoreError('SESSION_EXPIRED', 401),
    );

    const response = await GET(new Request('http://localhost/profile/photo'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: 'UNAUTHENTICATED' } });
  });
});

function mockProfilePhoto() {
  return vi.spyOn(StudentProfileCoreClient.prototype, 'getProfile').mockResolvedValue({
    canEditProfile: true,
    person: {
      entryYear: 2569,
      firstName: 'ณัฐดนัย',
      lastName: 'สุขใจ',
    },
    profile: {
      bio: null,
      consent: null,
      links: [],
      photo: {
        height: 512,
        url: 'https://media.example.test/profile-media/photo.webp',
        width: 512,
      },
      photoId: '82000000-0000-4000-8000-000000000001',
      publicId: '82000000-0000-4000-8000-000000000002',
      version: 1,
    },
  });
}
