import { verifyMediaSignature } from '../modules/works/infrastructure/self-hosted-media.storage';
import { createSignedMediaUrl } from './media-url';

describe('createSignedMediaUrl', () => {
  it('creates a bounded operation- and key-scoped public URL', () => {
    const secret = 'test-public-media-signing-secret-123';
    const key = 'profile-media/photo.webp';
    const url = new URL(createSignedMediaUrl('https://media.example.test', secret, key, 300));

    expect(url.origin).toBe('https://media.example.test');
    expect(Buffer.from(url.pathname.replace('/objects/', ''), 'base64url').toString('utf8')).toBe(
      key,
    );
    expect(
      verifyMediaSignature(
        secret,
        'GET',
        key,
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(true);
  });

  it('rejects missing secrets and invalid keys', () => {
    expect(() => createSignedMediaUrl('https://media.example.test', '', 'photo.webp', 300)).toThrow(
      'MEDIA_SIGNING_SECRET_REQUIRED',
    );
    expect(() =>
      createSignedMediaUrl(
        'https://media.example.test',
        'test-public-media-signing-secret-123',
        '',
        300,
      ),
    ).toThrow('MEDIA_KEY_INVALID');
  });
});
