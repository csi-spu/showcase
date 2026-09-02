import { SelfHostedProfilePhotoStorage } from './self-hosted-profile-photo.storage';

describe('SelfHostedProfilePhotoStorage', () => {
  it('keeps server-side reads private while browser uploads use the public media origin', async () => {
    const storage = new SelfHostedProfilePhotoStorage(
      'https://media.internal.test',
      'https://media.example.test',
      'test-signing-secret-that-is-at-least-32-bytes',
    );

    const getUrl = new URL(
      await storage.createPresignedGet({
        expiresInSeconds: 60,
        key: 'profile-media/photo.webp',
      }),
    );
    const putUrl = new URL(
      await storage.createPresignedPut({
        contentType: 'image/png',
        expiresInSeconds: 60,
        key: 'profile-quarantine/upload-id',
      }),
    );

    expect(getUrl.origin).toBe('https://media.internal.test');
    expect(putUrl.origin).toBe('https://media.example.test');
  });
});
