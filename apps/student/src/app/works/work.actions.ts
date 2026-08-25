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
