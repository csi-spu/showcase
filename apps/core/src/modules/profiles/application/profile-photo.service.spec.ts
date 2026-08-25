import type {
  ProfilePhotoInspector,
  ProfilePhotoRepository,
  ProfilePhotoStorage,
  ProfilePhotoUpload,
} from './profile-photo.ports';
import { ProfilePhotoError, ProfilePhotoService } from './profile-photo.service';

const ACCOUNT_ID = '61000000-0000-4000-8000-000000000001';
const PERSON_ID = '61000000-0000-4000-8000-000000000002';
const UPLOAD_ID = '61000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-08-25T08:00:00.000Z');

class FakePhotoRepository implements ProfilePhotoRepository {
  upload: ProfilePhotoUpload | null = null;
  completed: Parameters<ProfilePhotoRepository['completeUpload']>[0] | undefined;
  rejected: Parameters<ProfilePhotoRepository['rejectUpload']>[0] | undefined;

  createUpload(input: Parameters<ProfilePhotoRepository['createUpload']>[0]) {
    this.upload = { ...input, personId: PERSON_ID, status: 'pending_upload' };
    return Promise.resolve(true);
  }

  claimUpload(): Promise<ProfilePhotoUpload | null> {
    if (this.upload === null) return Promise.resolve(null);
    if (this.upload.status === 'ready') return Promise.resolve(this.upload);
    this.upload = { ...this.upload, status: 'processing' };
    return Promise.resolve(this.upload);
  }

  completeUpload(input: Parameters<ProfilePhotoRepository['completeUpload']>[0]) {
    this.completed = input;
    return Promise.resolve();
  }

  rejectUpload(input: Parameters<ProfilePhotoRepository['rejectUpload']>[0]) {
    this.rejected = input;
    return Promise.resolve();
  }

  releaseUpload(): Promise<void> {
    return Promise.resolve();
  }
}

class FakePhotoStorage implements ProfilePhotoStorage {
  bytes = Buffer.from('image');
  deletedKeys: string[] = [];

  createPresignedPut() {
    return Promise.resolve('https://example.r2.cloudflarestorage.com/presigned');
  }

  getObject() {
    return Promise.resolve(this.bytes);
  }

  putObject(): Promise<void> {
    return Promise.resolve();
  }

  deleteObject(key: string): Promise<void> {
    this.deletedKeys.push(key);
    return Promise.resolve();
  }
}

describe('ProfilePhotoService', () => {
  let repository: FakePhotoRepository;
  let storage: FakePhotoStorage;
  let inspector: ProfilePhotoInspector;
  let service: ProfilePhotoService;

  beforeEach(() => {
    repository = new FakePhotoRepository();
    storage = new FakePhotoStorage();
    inspector = {
      inspectAndSanitize: () =>
        Promise.resolve({
          byteSize: 1_024,
          bytes: Buffer.from('sanitized'),
          contentType: 'image/webp',
          height: 512,
          width: 512,
        }),
    };
    service = new ProfilePhotoService(
      repository,
      storage,
      inspector,
      { now: () => NOW },
      { generate: () => UPLOAD_ID },
    );
  });

  it('authorizes one short-lived exact-content PUT with a random object key', async () => {
    await expect(
      service.createUpload({
        actorAccountId: ACCOUNT_ID,
        byteSize: 2_097_152,
        canEditProfile: true,
        contentType: 'image/png',
      }),
    ).resolves.toEqual({
      expiresAt: '2026-08-25T08:10:00.000Z',
      headers: { 'content-type': 'image/png' },
      uploadId: UPLOAD_ID,
      uploadUrl: 'https://example.r2.cloudflarestorage.com/presigned',
    });
    expect(repository.upload?.quarantineObjectKey).toBe(`profile-quarantine/${UPLOAD_ID}`);
  });

  it.each([
    ['an Alumnus', { byteSize: 1_024, canEditProfile: false, contentType: 'image/png' }],
    ['an oversized file', { byteSize: 2_097_153, canEditProfile: true, contentType: 'image/png' }],
    ['an unsupported type', { byteSize: 1_024, canEditProfile: true, contentType: 'image/gif' }],
  ])('rejects presign for %s', async (_scenario, unsafe) => {
    await expect(
      service.createUpload({ actorAccountId: ACCOUNT_ID, ...unsafe }),
    ).rejects.toBeInstanceOf(ProfilePhotoError);
  });

  it('reauthorizes finalize, inspects bytes, stores only sanitized media, and deletes quarantine', async () => {
    await service.createUpload({
      actorAccountId: ACCOUNT_ID,
      byteSize: 1_024,
      canEditProfile: true,
      contentType: 'image/jpeg',
    });

    await expect(
      service.finalizeUpload({
        actorAccountId: ACCOUNT_ID,
        canEditProfile: true,
        uploadId: UPLOAD_ID,
      }),
    ).resolves.toEqual({ photoId: UPLOAD_ID, status: 'ready' });
    expect(repository.completed).toMatchObject({
      contentType: 'image/webp',
      height: 512,
      sanitizedObjectKey: `profile-media/${UPLOAD_ID}.webp`,
      uploadId: UPLOAD_ID,
      width: 512,
    });
    expect(storage.deletedKeys).toEqual([`profile-quarantine/${UPLOAD_ID}`]);
  });

  it('rejects invalid inspected media without making it attachable', async () => {
    await service.createUpload({
      actorAccountId: ACCOUNT_ID,
      byteSize: 1_024,
      canEditProfile: true,
      contentType: 'image/webp',
    });
    inspector = {
      inspectAndSanitize: () => Promise.reject(new ProfilePhotoError('INVALID_PROFILE_PHOTO', 422)),
    };
    service = new ProfilePhotoService(
      repository,
      storage,
      inspector,
      { now: () => NOW },
      { generate: () => UPLOAD_ID },
    );

    await expect(
      service.finalizeUpload({
        actorAccountId: ACCOUNT_ID,
        canEditProfile: true,
        uploadId: UPLOAD_ID,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROFILE_PHOTO', status: 422 });
    expect(repository.rejected).toMatchObject({
      rejectionCode: 'invalid_profile_photo',
      uploadId: UPLOAD_ID,
    });
    expect(repository.completed).toBeUndefined();
  });

  it('replays an already finalized upload without repeating storage side effects', async () => {
    await service.createUpload({
      actorAccountId: ACCOUNT_ID,
      byteSize: 1_024,
      canEditProfile: true,
      contentType: 'image/jpeg',
    });
    repository.upload = { ...repository.upload!, status: 'ready' };
    const getObject = jest.spyOn(storage, 'getObject');

    await expect(
      service.finalizeUpload({
        actorAccountId: ACCOUNT_ID,
        canEditProfile: true,
        uploadId: UPLOAD_ID,
      }),
    ).resolves.toEqual({ photoId: UPLOAD_ID, status: 'ready' });
    expect(getObject).not.toHaveBeenCalled();
  });
});
