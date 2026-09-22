'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CoreClientError } from '@showcase/core-client';
import {
  clearStudentCollectionSessionToken,
  readStudentCollectionSessionToken,
} from '@/lib/student-collection-auth-session';
import { StudentCollectionFormsCoreClient } from '@/lib/student-collection-forms-core';
import type { StudentCollectionFile } from '@/lib/student-collection-forms-core';
import { getStudentCollectionServerEnvironment } from '@/lib/server-environment';
import type { CollectionAnswers } from './collection-answers';
import { toErrorMessage } from './collection-forms-errors';
import type { StudentFormsErrorMessage } from './collection-forms-errors';

/** What a draft save reports back, including the version needed to reconcile a conflict. */
export interface SaveDraftResult {
  error: StudentFormsErrorMessage | null;
  fieldId: string | null;
  /** The server's answers when the save was refused as stale, so nothing is overwritten. */
  serverAnswers: CollectionAnswers | null;
  version: number | null;
}

export interface SubmitResult {
  blockedFieldId: string | null;
  error: StudentFormsErrorMessage | null;
  submissionId: string | null;
}

/**
 * Saves work in progress.
 *
 * This is only ever a save. It never submits, so a Student who steps away mid
 * form does not accidentally hand it in.
 *
 * On a version conflict the caller receives the server's current answers rather
 * than having its own written over it.
 */
export async function saveCollectionDraftAction(
  formId: string,
  expectedVersion: number,
  answers: CollectionAnswers,
): Promise<SaveDraftResult> {
  const token = await requireSessionToken();
  const client = coreClient();
  try {
    const result = await client.saveDraft(token, formId, { answers, expectedVersion });
    return { error: null, fieldId: null, serverAnswers: null, version: result.version };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    if (error instanceof CoreClientError && error.code === 'DRAFT_STALE') {
      /*
       * Someone else -- another tab, another device -- saved first. Hand back
       * what the server holds so the Student can reconcile deliberately. Never
       * retry the write, which would silently discard the other version.
       */
      const latest = await loadLatestDraft(token, client, formId);
      return {
        error: 'draftStale',
        fieldId: null,
        serverAnswers: latest.answers,
        version: latest.version,
      };
    }
    return { ...toFailure(error), serverAnswers: null, version: null };
  }
}

/**
 * The explicit submit.
 *
 * `idempotencyKey` is chosen by the caller and reused across retries, so a lost
 * response cannot produce a second submission.
 */
export async function submitCollectionFormAction(
  formId: string,
  expectedVersion: number,
  answers: CollectionAnswers,
  idempotencyKey: string,
): Promise<SubmitResult> {
  const token = await requireSessionToken();
  const client = coreClient();
  try {
    /* Save first so the submission reflects exactly what is on screen. */
    await client.saveDraft(token, formId, { answers, expectedVersion });
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    if (error instanceof CoreClientError && error.code === 'DRAFT_STALE') {
      return { blockedFieldId: null, error: 'draftStale', submissionId: null };
    }
    const failure = toFailure(error);
    return { blockedFieldId: failure.fieldId, error: failure.error, submissionId: null };
  }

  try {
    const result = await client.submit(token, formId, idempotencyKey);
    revalidatePath('/');
    return { blockedFieldId: null, error: null, submissionId: result.submissionId };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    const failure = toFailure(error);
    return { blockedFieldId: failure.fieldId, error: failure.error, submissionId: null };
  }
}

/**
 * Registers an upload slot before any bytes are sent.
 *
 * The file comes back `quarantined`. It is not an accepted document, and the UI
 * must not present it as one until an inspection has recorded a result.
 */
/**
 * Registers the file with Core and returns where the browser sends the bytes.
 *
 * The upload URL is short-lived and covers this one file. Core never proxies
 * the bytes, and the registered file stays quarantined until it is inspected.
 */
export async function createCollectionUploadAction(
  formId: string,
  input: { byteSize: number; declaredContentType: string; fieldId: string; filename: string },
): Promise<{
  error: StudentFormsErrorMessage | null;
  file: StudentCollectionFile | null;
  uploadUrl: string | null;
}> {
  const token = await requireSessionToken();
  try {
    const ticket = await coreClient().createUpload(token, formId, input);
    return { error: null, file: ticket.file, uploadUrl: ticket.uploadUrl };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { error: toFailure(error).error, file: null, uploadUrl: null };
  }
}

export async function attachCollectionFileAction(
  formId: string,
  fieldId: string,
  fileId: string,
): Promise<{ error: StudentFormsErrorMessage | null }> {
  const token = await requireSessionToken();
  try {
    await coreClient().attachFile(token, formId, { fieldId, fileId });
    revalidatePath('/');
    return { error: null };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { error: toFailure(error).error };
  }
}

export async function detachCollectionFileAction(
  formId: string,
  fileId: string,
): Promise<{ error: StudentFormsErrorMessage | null }> {
  const token = await requireSessionToken();
  try {
    await coreClient().detachFile(token, formId, fileId);
    revalidatePath('/');
    return { error: null };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { error: toFailure(error).error };
  }
}

async function loadLatestDraft(
  token: string,
  client: StudentCollectionFormsCoreClient,
  formId: string,
): Promise<{ answers: CollectionAnswers; version: number }> {
  const obligations = await client.list(token);
  const obligation = obligations.find((candidate) => candidate.form.id === formId);
  const draft = obligation?.draft ?? null;
  if (draft === null) return { answers: {}, version: 0 };
  return { answers: draft.answers as CollectionAnswers, version: draft.version };
}

function toFailure(error: unknown): {
  error: StudentFormsErrorMessage;
  fieldId: string | null;
} {
  if (!(error instanceof CoreClientError)) return { error: 'unavailable', fieldId: null };
  return { error: toErrorMessage(error.code), fieldId: null };
}

async function requireSessionToken(): Promise<string> {
  const token = await readStudentCollectionSessionToken();
  if (token === null) redirect('/?expired=1');
  return token;
}

async function expireSessionIfRequired(error: unknown): Promise<void> {
  if (
    !(error instanceof CoreClientError) ||
    !['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  ) {
    return;
  }
  await clearStudentCollectionSessionToken();
  redirect('/?expired=1');
}

function coreClient(): StudentCollectionFormsCoreClient {
  return new StudentCollectionFormsCoreClient(getStudentCollectionServerEnvironment());
}
