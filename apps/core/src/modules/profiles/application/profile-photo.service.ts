import { Inject, Injectable } from '@nestjs/common';
import {
  PROFILE_PHOTO_CLOCK,
  PROFILE_PHOTO_ID_GENERATOR,
  PROFILE_PHOTO_INSPECTOR,
  PROFILE_PHOTO_REPOSITORY,
  PROFILE_PHOTO_STORAGE,
  type ProfilePhotoClock,
  type ProfilePhotoContentType,
  type ProfilePhotoIdGenerator,
  type ProfilePhotoInspector,
  type ProfilePhotoRepository,
  type ProfilePhotoStorage,
} from './profile-photo.ports';

const MAX_PROFILE_PHOTO_BYTES = 2 * 1_024 * 1_024;
const PRESIGN_SECONDS = 10 * 60;
const UPLOAD_RETENTION_MILLISECONDS = 24 * 60 * 60 * 1_000;
const CONTENT_TYPES = new Set<ProfilePhotoContentType>(['image/jpeg', 'image/png', 'image/webp']);

type ProfilePhotoErrorCode =
  | 'INVALID_PROFILE_PHOTO'
  | 'PROFILE_EDIT_FORBIDDEN'
  | 'PROFILE_PHOTO_NOT_FOUND'
  | 'PROFILE_PHOTO_SERVICE_UNAVAILABLE';

export class ProfilePhotoError extends Error {
  constructor(
    readonly code: ProfilePhotoErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ProfilePhotoError';
  }
}

@Injectable()
export class ProfilePhotoService {
  constructor(
    @Inject(PROFILE_PHOTO_REPOSITORY) private readonly repository: ProfilePhotoRepository,
    @Inject(PROFILE_PHOTO_STORAGE) private readonly storage: ProfilePhotoStorage,
    @Inject(PROFILE_PHOTO_INSPECTOR) private readonly inspector: ProfilePhotoInspector,
    @Inject(PROFILE_PHOTO_CLOCK) private readonly clock: ProfilePhotoClock,
    @Inject(PROFILE_PHOTO_ID_GENERATOR)
    private readonly idGenerator: ProfilePhotoIdGenerator,
  ) {}

  async createUpload(input: {
    actorAccountId: string;
    byteSize: number;
    canEditProfile: boolean;
    contentType: string;
  }) {
    this.requireEditAccess(input.canEditProfile);
    if (
      !CONTENT_TYPES.has(input.contentType as ProfilePhotoContentType) ||
      !Number.isInteger(input.byteSize) ||
      input.byteSize <= 0 ||
      input.byteSize > MAX_PROFILE_PHOTO_BYTES
    ) {
      throw new ProfilePhotoError('INVALID_PROFILE_PHOTO', 422);
    }

    const contentType = input.contentType as ProfilePhotoContentType;
    const now = this.clock.now();
    const uploadId = this.idGenerator.generate();
    const quarantineObjectKey = `profile-quarantine/${uploadId}`;
    const expiresAt = new Date(now.getTime() + UPLOAD_RETENTION_MILLISECONDS);
    const isCreated = await this.repository.createUpload({
      actorAccountId: input.actorAccountId,
      byteSize: input.byteSize,
      contentType,
      createdAt: now,
      expiresAt,
      quarantineObjectKey,
      uploadId,
    });
    if (!isCreated) {
      throw new ProfilePhotoError('PROFILE_PHOTO_NOT_FOUND', 404);
    }

    let uploadUrl: string;
    try {
      uploadUrl = await this.storage.createPresignedPut({
        contentType,
        expiresInSeconds: PRESIGN_SECONDS,
        key: quarantineObjectKey,
      });
    } catch {
      throw new ProfilePhotoError('PROFILE_PHOTO_SERVICE_UNAVAILABLE', 503);
    }
    return {
      expiresAt: new Date(now.getTime() + PRESIGN_SECONDS * 1_000).toISOString(),
      headers: { 'content-type': contentType },
      uploadId,
      uploadUrl,
    };
  }

  async finalizeUpload(input: {
    actorAccountId: string;
    canEditProfile: boolean;
    uploadId: string;
  }) {
    this.requireEditAccess(input.canEditProfile);
    const now = this.clock.now();
    const upload = await this.repository.claimUpload({
      actorAccountId: input.actorAccountId,
      now,
      uploadId: input.uploadId,
    });
    if (upload === null) {
      throw new ProfilePhotoError('PROFILE_PHOTO_NOT_FOUND', 404);
    }
    if (upload.status === 'ready') {
      return { photoId: upload.uploadId, status: 'ready' as const };
    }

    try {
      const bytes = await this.storage.getObject(
        upload.quarantineObjectKey,
        MAX_PROFILE_PHOTO_BYTES,
      );
      const sanitized = await this.inspector.inspectAndSanitize({
        bytes,
        declaredByteSize: upload.byteSize,
        declaredContentType: upload.contentType,
      });
      const sanitizedObjectKey = `profile-media/${upload.uploadId}.webp`;
      await this.storage.putObject({
        body: sanitized.bytes,
        contentType: sanitized.contentType,
        key: sanitizedObjectKey,
      });
      await this.repository.completeUpload({
        byteSize: sanitized.byteSize,
        contentType: sanitized.contentType,
        height: sanitized.height,
        now,
        sanitizedObjectKey,
        uploadId: upload.uploadId,
        width: sanitized.width,
      });
      await this.deleteQuarantineBestEffort(upload.quarantineObjectKey);
      return { photoId: upload.uploadId, status: 'ready' as const };
    } catch (error: unknown) {
      if (error instanceof ProfilePhotoError && error.code === 'INVALID_PROFILE_PHOTO') {
        await this.repository.rejectUpload({
          now,
          rejectionCode: 'invalid_profile_photo',
          uploadId: upload.uploadId,
        });
        await this.deleteQuarantineBestEffort(upload.quarantineObjectKey);
        throw error;
      }
      await this.repository.releaseUpload({ now, uploadId: upload.uploadId });
      throw new ProfilePhotoError('PROFILE_PHOTO_SERVICE_UNAVAILABLE', 503);
    }
  }

  private requireEditAccess(canEditProfile: boolean): void {
    if (!canEditProfile) {
      throw new ProfilePhotoError('PROFILE_EDIT_FORBIDDEN', 403);
    }
  }

  private async deleteQuarantineBestEffort(key: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
    } catch {
      // Lifecycle cleanup is the backstop after authoritative state no longer references quarantine.
    }
  }
}
