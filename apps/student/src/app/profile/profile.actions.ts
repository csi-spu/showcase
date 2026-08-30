'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { StudentProfileCoreClient, StudentProfileCoreError } from '@/lib/student-profile-core';
import { validateProfileForm } from '@/lib/student-profile-validation';
import type { ProfileActionError, ProfileActionState } from './profile-action-state';

const consentMutationSchema = z.object({
  expectedVersion: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.uuid(),
});
const photoUploadSchema = z.object({
  byteSize: z.number().int().positive().max(2_097_152),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
const finalizePhotoUploadSchema = z
  .object({
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    idempotencyKey: z.uuid(),
    uploadId: z.uuid(),
  })
  .strict();

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const input = validateProfileForm(formData);
  if (input === 'invalid') return { error: 'invalid', success: false };
  try {
    await client().updateProfile(await sessionToken(), input);
  } catch (error: unknown) {
    return { error: mapError(error), success: false };
  }
  revalidatePath('/profile');
  return { error: null, success: true };
}

export async function grantConsentAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const input = consentMutationSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: 'invalid', success: false };
  try {
    await client().grantConsent(await sessionToken(), {
      ...input.data,
      consentTextVersion: 'phase-1-v1',
    });
  } catch (error: unknown) {
    return { error: mapError(error), success: false };
  }
  revalidatePath('/profile');
  return { error: null, success: true };
}

export async function withdrawConsentAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const input = consentMutationSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: 'invalid', success: false };
  try {
    await client().withdrawConsent(await sessionToken(), input.data);
  } catch (error: unknown) {
    return { error: mapError(error), success: false };
  }
  revalidatePath('/profile');
  return { error: null, success: true };
}

export async function createPhotoUploadAction(input: unknown) {
  const parsed = photoUploadSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  try {
    const upload = await client().createPhotoUpload(await sessionToken(), parsed.data);
    return { data: upload };
  } catch (error: unknown) {
    return { error: mapError(error) };
  }
}

export async function finalizePhotoUploadAction(input: unknown) {
  const parsed = finalizePhotoUploadSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  try {
    const token = await sessionToken();
    const profileClient = client();
    const photo = await profileClient.finalizePhotoUpload(token, parsed.data.uploadId);
    const current = await profileClient.getProfile(token);
    await profileClient.updateProfile(token, {
      bio: current.profile?.bio ?? null,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
      links: current.profile?.links ?? [],
      photoId: photo.photoId,
    });
    revalidatePath('/profile');
    return {
      data: { ...photo, version: parsed.data.expectedVersion + 1 },
    };
  } catch (error: unknown) {
    return { error: mapError(error) };
  }
}

function client(): StudentProfileCoreClient {
  return new StudentProfileCoreClient(getStudentServerEnvironment());
}

async function sessionToken(): Promise<string> {
  const token = await readStudentSessionToken();
  if (token === null) redirect('/?expired=1');
  return token;
}

function mapError(error: unknown): ProfileActionError {
  if (!(error instanceof StudentProfileCoreError)) return 'network';
  if (['PROFILE_IDEMPOTENCY_CONFLICT', 'PROFILE_VERSION_CONFLICT'].includes(error.code)) {
    return 'conflict';
  }
  if (['INVALID_PROFILE', 'INVALID_REQUEST', 'PROFILE_INCOMPLETE'].includes(error.code)) {
    return 'invalid';
  }
  if (error.code.startsWith('PROFILE_PHOTO')) return 'photo';
  return error.code === 'AUTH_SERVICE_UNAVAILABLE' ? 'network' : 'unavailable';
}
