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
import type {
  WorkRevisionActionError,
  WorkRevisionActionState,
} from './work-revision-action-state';

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

export async function submitWorkRevisionAction(
  publicId: string,
  previousState: WorkRevisionActionState,
  formData: FormData,
): Promise<WorkRevisionActionState> {
  const parsedPublicId = z.uuid().safeParse(publicId);
  const expectedBaseValue = formData.get('expectedBasePublishedRevisionId');
  const parsed = z
    .object({
      attributionName: z.string().trim().min(1).max(100),
      expectedBasePublishedRevisionId: z.uuid().nullable(),
      expectedDraftVersion: z.coerce.number().int().positive(),
      idempotencyKey: z.uuid(),
      studyYear: z.coerce.number().int().min(1).max(8),
    })
    .safeParse({
      attributionName: formData.get('attributionName'),
      expectedBasePublishedRevisionId: expectedBaseValue === '' ? null : expectedBaseValue,
      expectedDraftVersion: formData.get('expectedDraftVersion'),
      idempotencyKey: formData.get('idempotencyKey'),
      studyYear: formData.get('studyYear'),
    });
  if (!parsedPublicId.success || !parsed.success) {
    return revisionFailed(previousState, 'invalid');
  }
  try {
    await client().submitRevision(await sessionToken(), parsedPublicId.data, parsed.data);
  } catch (error: unknown) {
    return revisionFailed(previousState, mapRevisionError(error));
  }
  revalidatePath(`/works/${parsedPublicId.data}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

export async function withdrawWorkRevisionAction(
  publicId: string,
  revisionPublicId: string,
  previousState: WorkRevisionActionState,
  formData: FormData,
): Promise<WorkRevisionActionState> {
  const parsed = z
    .object({
      expectedRevisionVersion: z.coerce.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
      revisionPublicId: z.uuid(),
    })
    .safeParse({
      expectedRevisionVersion: formData.get('expectedRevisionVersion'),
      idempotencyKey: formData.get('idempotencyKey'),
      publicId,
      revisionPublicId,
    });
  if (!parsed.success) return revisionFailed(previousState, 'invalid');
  try {
    await client().withdrawRevision(
      await sessionToken(),
      parsed.data.publicId,
      parsed.data.revisionPublicId,
      {
        expectedRevisionVersion: parsed.data.expectedRevisionVersion,
        idempotencyKey: parsed.data.idempotencyKey,
      },
    );
  } catch (error: unknown) {
    return revisionFailed(previousState, mapRevisionError(error));
  }
  revalidatePath(`/works/${parsed.data.publicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

export async function seedPublishedWorkDraftAction(
  publicId: string,
  previousState: WorkRevisionActionState,
  formData: FormData,
): Promise<WorkRevisionActionState> {
  const parsed = z
    .object({
      expectedPublishedRevisionId: z.uuid(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
    })
    .safeParse({
      expectedPublishedRevisionId: formData.get('expectedPublishedRevisionId'),
      idempotencyKey: formData.get('idempotencyKey'),
      publicId,
    });
  if (!parsed.success) return revisionFailed(previousState, 'invalid');
  try {
    await client().seedPublishedDraft(await sessionToken(), parsed.data.publicId, {
      expectedPublishedRevisionId: parsed.data.expectedPublishedRevisionId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    return revisionFailed(previousState, mapRevisionError(error));
  }
  revalidatePath(`/works/${parsed.data.publicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

export async function rebaseWorkDraftAction(
  publicId: string,
  previousState: WorkRevisionActionState,
  formData: FormData,
): Promise<WorkRevisionActionState> {
  const parsed = z
    .object({
      expectedPublishedRevisionId: z.uuid(),
      expectedVersion: z.coerce.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
    })
    .safeParse({
      expectedPublishedRevisionId: formData.get('expectedPublishedRevisionId'),
      expectedVersion: formData.get('expectedVersion'),
      idempotencyKey: formData.get('idempotencyKey'),
      publicId,
    });
  if (!parsed.success) return revisionFailed(previousState, 'invalid');
  try {
    await client().rebaseDraft(await sessionToken(), parsed.data.publicId, {
      expectedPublishedRevisionId: parsed.data.expectedPublishedRevisionId,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    return revisionFailed(previousState, mapRevisionError(error));
  }
  revalidatePath(`/works/${parsed.data.publicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
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

function revisionFailed(
  previousState: WorkRevisionActionState,
  error: WorkRevisionActionError,
): WorkRevisionActionState {
  return { ...previousState, error, success: false };
}

function mapRevisionError(error: unknown): WorkRevisionActionError {
  if (!(error instanceof StudentWorksCoreError)) return 'network';
  if (
    [
      'WORK_IDEMPOTENCY_CONFLICT',
      'WORK_PENDING_REVISION_EXISTS',
      'WORK_REVISION_STATE_CONFLICT',
      'WORK_REVISION_VERSION_CONFLICT',
      'WORK_BASE_REVISION_CONFLICT',
      'WORK_DRAFT_EXISTS',
      'WORK_NOT_PUBLISHED',
      'WORK_VERSION_CONFLICT',
    ].includes(error.code)
  )
    return 'conflict';
  if (error.code === 'WORK_POSTER_REQUIRED') return 'poster';
  if (error.code === 'WORK_MEDIA_NOT_READY') return 'media';
  if (
    [
      'WORK_ATTRIBUTION_UNRESOLVED',
      'WORK_ATTRIBUTION_LIMIT_EXCEEDED',
      'WORK_ATTRIBUTION_DUPLICATE',
      'WORK_SUBMITTER_ATTRIBUTION_INVALID',
    ].includes(error.code)
  )
    return 'attribution';
  if (error.code === 'WORK_SUBMISSION_INCOMPLETE') return 'incomplete';
  if (error.code === 'INVALID_REQUEST') return 'invalid';
  return error.code === 'WORKS_SERVICE_UNAVAILABLE' ? 'network' : 'unavailable';
}
