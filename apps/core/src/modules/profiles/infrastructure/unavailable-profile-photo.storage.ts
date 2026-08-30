import type { ProfilePhotoStorage } from '../application/profile-photo.ports';

export class UnavailableProfilePhotoStorage implements ProfilePhotoStorage {
  createPresignedGet(): Promise<string> {
    return Promise.reject(new Error('PROFILE_PHOTO_STORAGE_NOT_CONFIGURED'));
  }

  createPresignedPut(): Promise<string> {
    return Promise.reject(new Error('PROFILE_PHOTO_STORAGE_NOT_CONFIGURED'));
  }

  getObject(): Promise<Buffer> {
    return Promise.reject(new Error('PROFILE_PHOTO_STORAGE_NOT_CONFIGURED'));
  }

  putObject(): Promise<void> {
    return Promise.reject(new Error('PROFILE_PHOTO_STORAGE_NOT_CONFIGURED'));
  }

  deleteObject(): Promise<void> {
    return Promise.reject(new Error('PROFILE_PHOTO_STORAGE_NOT_CONFIGURED'));
  }
}
