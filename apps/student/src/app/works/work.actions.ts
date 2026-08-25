'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { StudentWorksCoreClient, StudentWorksCoreError } from '@/lib/student-works-core';
import { validateWorkForm } from '@/lib/student-work-validation';
import type { WorkActionError, WorkActionState } from './work-action-state';

export async function createWorkAction(
  previousState: WorkActionState,
  formData: FormData,
): Promise<WorkActionState> {
  const token = await sessionToken();
  const works = client();
  let context;
  try {
    context = await works.getAuthoringContext(token);
  } catch (error: unknown) {
    return failed(previousState, mapError(error));
  }
  const validation = validateWorkForm(formData, context);
  if (!validation.success) {
    return failed(previousState, 'invalid', validation.fieldErrors);
  }
  if ('expectedVersion' in validation.data) return failed(previousState, 'invalid');

  let publicId: string;
  try {
    const result = await works.createWork(token, validation.data);
    publicId = result.work.publicId;
  } catch (error: unknown) {
    return failed(previousState, mapError(error));
  }
  revalidatePath('/');
  redirect(`/works/${publicId}`);
}

export async function updateWorkAction(
  publicId: string,
  previousState: WorkActionState,
  formData: FormData,
): Promise<WorkActionState> {
  const parsedPublicId = z.uuid().safeParse(publicId);
  if (!parsedPublicId.success) return failed(previousState, 'invalid');
  const token = await sessionToken();
  const works = client();
  let context;
  try {
    context = await works.getAuthoringContext(token);
  } catch (error: unknown) {
    return failed(previousState, mapError(error));
  }
  const validation = validateWorkForm(formData, context);
  if (!validation.success) {
    return failed(previousState, 'invalid', validation.fieldErrors);
  }
  if (!('expectedVersion' in validation.data)) return failed(previousState, 'invalid');

  let version: number;
  try {
    const result = await works.updateWork(token, parsedPublicId.data, validation.data);
    version = result.work.version;
  } catch (error: unknown) {
    return failed(previousState, mapError(error));
  }
  revalidatePath(`/works/${parsedPublicId.data}`);
  return {
    error: null,
    fieldErrors: [],
    idempotencyKey: randomUUID(),
    success: true,
    version,
  };
}

export async function uploadWorkMediaAction(input: {
  byteSize: number;
  contentType: string;
  fileExtension: string;
  idempotencyKey: string;
  mediaKind: 'gallery' | 'poster';
  publicId: string;
}) {
  const parsed = z
    .object({
      byteSize: z.number().int().positive().max(5_242_880),
      contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      fileExtension: z.enum(['jpeg', 'jpg', 'png', 'webp']),
      idempotencyKey: z.uuid(),
      mediaKind: z.enum(['gallery', 'poster']),
      publicId: z.uuid(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  try {
    const token = await sessionToken();
    return await client().authorizeMediaUpload(token, parsed.data.publicId, parsed.data);
  } catch (error: unknown) {
    return { error: mapError(error) };
  }
}

export async function finalizeWorkMediaAction(input: { assetId: string; publicId: string }) {
  const parsed = z.object({ assetId: z.uuid(), publicId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  try {
    const token = await sessionToken();
    return await client().finalizeMediaUpload(token, parsed.data.publicId, parsed.data.assetId);
  } catch (error: unknown) {
    return { error: mapError(error) };
  }
}

export async function getWorkMediaStatusAction(input: { assetId: string; publicId: string }) {
  const parsed = z.object({ assetId: z.uuid(), publicId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  try {
    return await client().getMediaUploadStatus(
      await sessionToken(),
      parsed.data.publicId,
      parsed.data.assetId,
    );
  } catch (error: unknown) {
    return { error: mapError(error) };
  }
}

export async function attachWorkMediaAction(input: {
  assetId: string;
  expectedVersion: number;
  mediaKind: 'gallery' | 'poster';
  publicId: string;
}) {
  const parsed = z
    .object({
      assetId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      mediaKind: z.enum(['gallery', 'poster']),
      publicId: z.uuid(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  try {
    return await client().attachMedia(await sessionToken(), parsed.data.publicId, {
      assetId: parsed.data.assetId,
      expectedVersion: parsed.data.expectedVersion,
      mediaKind: parsed.data.mediaKind,
    });
  } catch (error: unknown) {
    return { error: mapError(error) };
  }
}

function client(): StudentWorksCoreClient {
  return new StudentWorksCoreClient(getStudentServerEnvironment());
}

async function sessionToken(): Promise<string> {
  const token = await readStudentSessionToken();
  if (token === null) redirect('/?expired=1');
  return token;
}

function failed(
  previousState: WorkActionState,
  error: WorkActionError,
  fieldErrors: WorkActionState['fieldErrors'] = [],
): WorkActionState {
  return { ...previousState, error, fieldErrors, success: false };
}

function mapError(error: unknown): WorkActionError {
  if (!(error instanceof StudentWorksCoreError)) return 'network';
  if (['WORK_IDEMPOTENCY_CONFLICT', 'WORK_VERSION_CONFLICT'].includes(error.code)) {
    return 'conflict';
  }
  if (['INVALID_REQUEST', 'INVALID_WORK_DRAFT'].includes(error.code)) return 'invalid';
  return error.code === 'AUTH_SERVICE_UNAVAILABLE' || error.code === 'WORKS_SERVICE_UNAVAILABLE'
    ? 'network'
    : 'unavailable';
}
