import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  finalizePhotoUpload: vi.fn(),
  getProfile: vi.fn(),
  readToken: vi.fn(),
  revalidate: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: dependencies.revalidate }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.test',
    studentBffSecret: 'x'.repeat(32),
    visitorUrl: 'https://visitor.test',
  }),
}));
vi.mock('@/lib/student-auth-session', () => ({ readStudentSessionToken: dependencies.readToken }));
vi.mock('@/lib/student-profile-core', () => ({
  StudentProfileCoreClient: class {
    finalizePhotoUpload = dependencies.finalizePhotoUpload;
    getProfile = dependencies.getProfile;
    updateProfile = dependencies.updateProfile;
  },
  StudentProfileCoreError: class extends Error {
    code = 'TEST';
    status = 500;
  },
}));

import { finalizePhotoUploadAction } from './profile.actions';

describe('finalizePhotoUploadAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('session');
    dependencies.finalizePhotoUpload.mockResolvedValue({
      photoId: '71000000-0000-4000-8000-000000000004',
      status: 'ready',
    });
    dependencies.getProfile.mockResolvedValue({
      canEditProfile: true,
      person: null,
      profile: {
        bio: 'นักพัฒนาซอฟต์แวร์',
        consent: null,
        links: [{ label: 'Portfolio', url: 'https://portfolio.example.test/' }],
        photo: null,
        photoId: null,
        publicId: '71000000-0000-4000-8000-000000000001',
        version: 3,
      },
    });
    dependencies.updateProfile.mockResolvedValue({ outcome: 'updated' });
  });

  it('finalizes and immediately attaches the ready photo without overwriting profile content', async () => {
    await expect(
      finalizePhotoUploadAction({
        expectedVersion: 3,
        idempotencyKey: '71000000-0000-4000-8000-000000000005',
        uploadId: '71000000-0000-4000-8000-000000000004',
      }),
    ).resolves.toEqual({
      data: {
        photoId: '71000000-0000-4000-8000-000000000004',
        status: 'ready',
        version: 4,
      },
    });
    expect(dependencies.updateProfile).toHaveBeenCalledWith('session', {
      bio: 'นักพัฒนาซอฟต์แวร์',
      expectedVersion: 3,
      idempotencyKey: '71000000-0000-4000-8000-000000000005',
      links: [{ label: 'Portfolio', url: 'https://portfolio.example.test/' }],
      photoId: '71000000-0000-4000-8000-000000000004',
    });
    expect(dependencies.revalidate).toHaveBeenCalledWith('/profile');
  });
});
