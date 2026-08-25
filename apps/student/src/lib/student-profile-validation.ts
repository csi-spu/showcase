import { z } from 'zod';
import type { ProfileUpdateInput } from './student-profile-core';

const baseSchema = z.object({
  bio: z
    .string()
    .max(500)
    .transform((value) => value.trim() || null),
  displayName: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(100)),
  expectedVersion: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.uuid(),
  photoId: z
    .string()
    .transform((value) => value || null)
    .pipe(z.uuid().nullable()),
});

export function validateProfileForm(formData: FormData): ProfileUpdateInput | 'invalid' {
  const base = baseSchema.safeParse({
    bio: stringValue(formData, 'bio'),
    displayName: stringValue(formData, 'displayName'),
    expectedVersion: stringValue(formData, 'expectedVersion'),
    idempotencyKey: stringValue(formData, 'idempotencyKey'),
    photoId: stringValue(formData, 'photoId'),
  });
  if (!base.success) {
    return 'invalid';
  }

  const links: ProfileUpdateInput['links'] = [];
  const urls = new Set<string>();
  for (let index = 0; index < 5; index += 1) {
    const label = stringValue(formData, `linkLabel${index}`).trim();
    const rawUrl = stringValue(formData, `linkUrl${index}`);
    if (label.length === 0 && rawUrl.length === 0) {
      continue;
    }
    if (label.length === 0 || label.length > 50 || rawUrl.length > 2_048) {
      return 'invalid';
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return 'invalid';
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      urls.has(parsed.href)
    ) {
      return 'invalid';
    }
    urls.add(parsed.href);
    links.push({ label, url: parsed.href });
  }

  return { ...base.data, links };
}

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}
