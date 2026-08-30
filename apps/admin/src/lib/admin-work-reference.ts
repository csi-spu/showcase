import { z } from 'zod';

const workPublicIdSchema = z.uuid();
const workPathPattern = /^\/works\/([^/]+)\/?$/;

export function parseAdminWorkReference(value: string | undefined): string | null {
  if (value === undefined) return null;

  const reference = value.trim();
  const directIdentifier = workPublicIdSchema.safeParse(reference);
  if (directIdentifier.success) return directIdentifier.data;

  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const match = workPathPattern.exec(url.pathname);
  if (match === null) return null;

  const identifier = workPublicIdSchema.safeParse(match[1]);
  return identifier.success ? identifier.data : null;
}
