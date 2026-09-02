import type {
  ProfilePhotoContentType,
  ProfilePhotoStorage,
} from '../application/profile-photo.ports';
import { SelfHostedMediaStorage } from '../../works/infrastructure/self-hosted-media.storage';

export class SelfHostedProfilePhotoStorage implements ProfilePhotoStorage {
  private readonly delegate: SelfHostedMediaStorage;

  constructor(baseUrl: string, publicBaseUrl: string, signingSecret: string) {
    this.delegate = new SelfHostedMediaStorage(baseUrl, publicBaseUrl, signingSecret);
  }

  createPresignedGet(input: { expiresInSeconds: number; key: string }) {
    return this.delegate.createInternalPresignedGet(input);
  }
  createPresignedPut(input: {
    contentType: ProfilePhotoContentType;
    expiresInSeconds: number;
    key: string;
  }) {
    return this.delegate.createPresignedPut(input);
  }
  deleteObject(key: string) {
    return this.delegate.deleteObject(key);
  }
  getObject(key: string, maximumBytes: number) {
    return this.delegate.getObject(key, maximumBytes);
  }
  putObject(input: { body: Buffer; contentType: ProfilePhotoContentType; key: string }) {
    return this.delegate.putObject({ ...input, contentType: 'image/webp' });
  }
}
