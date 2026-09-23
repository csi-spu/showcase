'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CoreClientError } from '@showcase/core-client';
import { isExpired } from './collection-groups-action-policy';
import { INITIAL_FORM_ACTION_STATE, toFormsErrorMessage } from './collection-forms-state';
import type { CollectionFormActionState } from './collection-forms-state';
import {
  clearInstructorSessionToken,
  readInstructorSessionToken,
} from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import {
  validateCheckSubmission,
  validateCreateForm,
  validateCreateFromTemplate,
  validateFormMetadata,
  validateLifecycleReason,
  validateSaveAsTemplate,
  validateUpdateForm,
} from '@/lib/collection-forms-validation';

/**
 * Creates a Draft form with the structure the builder composed.
 *
 * The builder posts the whole field array once, so adding, reordering, or
 * previewing a field never reaches the server.
 */
export async function createCollectionFormAction(
  groupId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const input = validateCreateForm(formData);
  if (input === null) return { ...INITIAL_FORM_ACTION_STATE, error: 'invalid', submitted: true };
  const sessionToken = await requireSessionToken();
  let form;
  try {
    form = await coreClient().create(sessionToken, groupId, input);
  } catch (error: unknown) {
    return await toFailure(error);
  }
  redirect(`/groups/${groupId}/forms/${form.id}`);
}

/** Replaces a Draft form's structure. Core refuses once the form is open. */
export async function updateCollectionFormAction(
  groupId: string,
  formId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const input = validateUpdateForm(formData);
  if (input === null) return { ...INITIAL_FORM_ACTION_STATE, error: 'invalid', submitted: true };
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().update(sessionToken, formId, input);
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/groups/${groupId}/forms/${formId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/** Edits the title, description, and deadline that stay editable after opening. */
export async function updateCollectionFormMetadataAction(
  groupId: string,
  formId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const input = validateFormMetadata(formData);
  if (input === null) return { ...INITIAL_FORM_ACTION_STATE, error: 'invalid', submitted: true };
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().updateMetadata(sessionToken, formId, input);
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/groups/${groupId}/forms/${formId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/** Opens the form for answers. This permanently locks its structure. */
export async function openCollectionFormAction(
  groupId: string,
  formId: string,
): Promise<CollectionFormActionState> {
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().open(sessionToken, formId);
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/groups/${groupId}/forms/${formId}`);
  revalidatePath(`/groups/${groupId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/**
 * Stops new first submissions on an open form.
 *
 * Deliberately narrower than closing the round: a closed form still accepts the
 * corrections an Instructor asked for, and checking continues. The reason is
 * required because this is the record of why the form stopped accepting work.
 */
export async function closeCollectionFormAction(
  groupId: string,
  formId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const reason = validateLifecycleReason(formData);
  if (reason === null) {
    return { ...INITIAL_FORM_ACTION_STATE, error: 'reasonRequired', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().close(sessionToken, formId, { reason });
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/groups/${groupId}/forms/${formId}`);
  revalidatePath(`/groups/${groupId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/**
 * Reopens a closed form for first submissions.
 *
 * Only current members who never received an obligation get one, so nobody who
 * already submitted is asked to submit again. The dialog shows that count
 * before this runs.
 */
export async function reopenCollectionFormAction(
  groupId: string,
  formId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const reason = validateLifecycleReason(formData);
  if (reason === null) {
    return { ...INITIAL_FORM_ACTION_STATE, error: 'reasonRequired', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().reopen(sessionToken, formId, { reason });
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/groups/${groupId}/forms/${formId}`);
  revalidatePath(`/groups/${groupId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/**
 * Copies this form's fields into a new Template.
 *
 * Core copies structure only: never the group, recipients, answers, or deadline.
 */
export async function saveCollectionFormAsTemplateAction(
  formId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const input = validateSaveAsTemplate(formData);
  if (input === null) {
    return { ...INITIAL_FORM_ACTION_STATE, error: 'templateNameInvalid', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().saveAsTemplate(sessionToken, formId, input);
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath('/templates');
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/** Creates a Draft form from a Template. The copy is independent from then on. */
export async function createCollectionFormFromTemplateAction(
  groupId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const input = validateCreateFromTemplate(formData);
  if (input === null) return { ...INITIAL_FORM_ACTION_STATE, error: 'invalid', submitted: true };
  const sessionToken = await requireSessionToken();
  let form;
  try {
    form = await coreClient().createFromTemplate(sessionToken, groupId, input);
  } catch (error: unknown) {
    return await toFailure(error);
  }
  redirect(`/groups/${groupId}/forms/${form.id}`);
}

/** Edits a Template. Forms already created from it are unaffected. */
export async function updateCollectionTemplateAction(
  templateId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const input = validateUpdateForm(formData);
  const name = formData.get('name');
  if (input === null || typeof name !== 'string' || name.trim().length === 0) {
    return { ...INITIAL_FORM_ACTION_STATE, error: 'invalid', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().updateTemplate(sessionToken, templateId, {
      name: name.trim(),
      description: input.description,
      fields: input.fields,
    });
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/templates/${templateId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/**
 * Records a checking decision for one submission.
 *
 * `expectedSubmissionId` is the submission the Instructor actually read. If the
 * Student has submitted again since, Core rejects this as stale rather than
 * applying a verdict to work nobody reviewed.
 */
export async function checkCollectionSubmissionAction(
  groupId: string,
  formId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const input = validateCheckSubmission(formData);
  if (input === null) return { ...INITIAL_FORM_ACTION_STATE, error: 'invalid', submitted: true };
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().check(sessionToken, input.submissionId, {
      decision: input.decision,
      reason: input.reason,
    });
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/groups/${groupId}/forms/${formId}/submissions`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/**
 * Closes a whole round read-only.
 *
 * Outstanding work does not block this -- the Instructor confirms against the
 * counts the dialog showed and decides -- but closing stops every write in the
 * round, including the corrections a closed form would still have allowed.
 */
export async function closeCollectionRoundAction(
  roundId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const reason = validateLifecycleReason(formData);
  if (reason === null) {
    return { ...INITIAL_FORM_ACTION_STATE, error: 'reasonRequired', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().closeRound(sessionToken, roundId, { reason });
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/rounds/${roundId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/** Reopens a closed round so its forms accept work again. */
export async function reopenCollectionRoundAction(
  roundId: string,
  _previousState: CollectionFormActionState,
  formData: FormData,
): Promise<CollectionFormActionState> {
  const reason = validateLifecycleReason(formData);
  if (reason === null) {
    return { ...INITIAL_FORM_ACTION_STATE, error: 'reasonRequired', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().reopenRound(sessionToken, roundId, { reason });
  } catch (error: unknown) {
    return await toFailure(error);
  }
  revalidatePath(`/rounds/${roundId}`);
  return { ...INITIAL_FORM_ACTION_STATE, submitted: true };
}

/**
 * Turns a Core failure into builder state.
 *
 * `CoreClientError` carries only the error code, so a field-scoped rejection
 * arrives here without its `fieldId`. The builder runs the same field rules
 * before posting, so in practice it has already pointed at the offending field;
 * a code that still reaches Core is shown as a form-level message.
 */
async function toFailure(error: unknown): Promise<CollectionFormActionState> {
  await expireSessionIfRequired(error);
  if (!(error instanceof CoreClientError)) {
    return { ...INITIAL_FORM_ACTION_STATE, error: 'unavailable', submitted: true };
  }
  return { ...INITIAL_FORM_ACTION_STATE, error: toFormsErrorMessage(error.code), submitted: true };
}

async function requireSessionToken(): Promise<string> {
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  return sessionToken;
}

async function expireSessionIfRequired(error: unknown): Promise<void> {
  if (!isExpired(error)) return;
  await clearInstructorSessionToken();
  redirect('/?expired=1');
}

function coreClient(): InstructorCollectionFormsCoreClient {
  return new InstructorCollectionFormsCoreClient(getInstructorServerEnvironment());
}
