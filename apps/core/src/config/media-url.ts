import { createHmac } from 'node:crypto';

export function createSignedMediaUrl(
  origin: string,
  secret: string,
  key: string,
  expiresInSeconds: number,
): string {
  if (secret.length < 32) throw new Error('MEDIA_SIGNING_SECRET_REQUIRED');
  if (key.length === 0 || key.length > 512) throw new Error('MEDIA_KEY_INVALID');
  const expires = Math.floor(Date.now() / 1_000) + Math.max(1, Math.floor(expiresInSeconds));
  const signature = createHmac('sha256', secret)
    .update(`GET\n${key}\n${expires}`)
    .digest('base64url');
  const encodedKey = Buffer.from(key, 'utf8').toString('base64url');
  return `${new URL(origin).origin}/objects/${encodedKey}?expires=${expires}&signature=${signature}`;
}
