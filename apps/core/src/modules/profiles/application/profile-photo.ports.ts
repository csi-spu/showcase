export const PROFILE_PHOTO_CLOCK = Symbol('PROFILE_PHOTO_CLOCK');
export const PROFILE_PHOTO_ID_GENERATOR = Symbol('PROFILE_PHOTO_ID_GENERATOR');
export const PROFILE_PHOTO_INSPECTOR = Symbol('PROFILE_PHOTO_INSPECTOR');
export const PROFILE_PHOTO_REPOSITORY = Symbol('PROFILE_PHOTO_REPOSITORY');
export const PROFILE_PHOTO_STORAGE = Symbol('PROFILE_PHOTO_STORAGE');

export type ProfilePhotoContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ProfilePhotoUpload {
  byteSize: number;
  contentType: ProfilePhotoContentType;
  createdAt: Date;
  expiresAt: Date;
  personId: string;
  quarantineObjectKey: string;
  status: 'pending_upload' | 'processing' | 'ready';
  uploadId: string;
}

export interface ProfilePhotoRepository {
  claimUpload(input: {
    actorAccountId: string;
    now: Date;
    uploadId: string;
  }): Promise<ProfilePhotoUpload | null>;
  completeUpload(input: {
    byteSize: number;
    contentType: ProfilePhotoContentType;
    height: number;
    now: Date;
    sanitizedObjectKey: string;
    uploadId: string;
    width: number;
  }): Promise<void>;
  createUpload(input: {
    actorAccountId: string;
    byteSize: number;
    contentType: ProfilePhotoContentType;
    createdAt: Date;
    expiresAt: Date;
    quarantineObjectKey: string;
    uploadId: string;
  }): Promise<boolean>;
  findPrivatePhotoObjectKey(actorAccountId: string): Promise<string | null>;
  findPublicPhotoObjectKey(publicId: string): Promise<string | null>;
  rejectUpload(input: {
    now: Date;
    rejectionCode: 'invalid_profile_photo';
    uploadId: string;
  }): Promise<void>;
  releaseUpload(input: { now: Date; uploadId: string }): Promise<void>;
}

export interface ProfilePhotoStorage {
  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string>;
  createPresignedPut(input: {
    contentType: ProfilePhotoContentType;
    expiresInSeconds: number;
    key: string;
  }): Promise<string>;
  deleteObject(key: string): Promise<void>;
  getObject(key: string, maximumBytes: number): Promise<Buffer>;
  putObject(input: {
    body: Buffer;
    contentType: ProfilePhotoContentType;
    key: string;
  }): Promise<void>;
}

export interface SanitizedProfilePhoto {
  byteSize: number;
  bytes: Buffer;
  contentType: 'image/webp';
  height: number;
  width: number;
}

export interface ProfilePhotoInspector {
  inspectAndSanitize(input: {
    bytes: Buffer;
    declaredByteSize: number;
    declaredContentType: ProfilePhotoContentType;
  }): Promise<SanitizedProfilePhoto>;
}

export interface ProfilePhotoClock {
  now(): Date;
}

export interface ProfilePhotoIdGenerator {
  generate(): string;
}
