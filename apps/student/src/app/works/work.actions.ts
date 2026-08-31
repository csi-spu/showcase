'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { clearStudentSessionToken, readStudentSessionToken } from '@/lib/student-auth-session';
import {
  StudentWorksCoreClient,
  StudentWorksCoreError,
  type WorkContributor,
  type WorkDraft,
  type WorkDraftPatch,
} from '@/lib/student-works-core';
import type {
  WorkRevisionActionError,
  WorkRevisionActionState,
} from './work-revision-action-state';
import type { WorkRemovalActionError, WorkRemovalActionState } from './work-removal-state';

const categorySchema = z.enum(['course_work', 'competition_entry', 'academic_article']);
const semesterSchema = z.enum(['1', '2', 'summer']);
const linkSchema = z.object({ label: z.string().max(50), url: z.string().max(2_048) }).strict();
const contributorSearchQuerySchema = z
  .string()
  .trim()
  .max(100)
  .refine((query) => /^[0-9]{1,8}$/u.test(query) || [...query].length >= 2);
const draftPatchSchema = z
  .object({
    academicPeriod: z
      .object({ semester: semesterSchema.nullable(), year: z.number().int().nullable() })
      .strict()
      .nullable()
      .optional(),
    category: categorySchema.nullable().optional(),
    description: z.string().max(10_000).nullable().optional(),
    links: z.array(linkSchema).max(5).optional(),
    submitterStudyYear: z.number().int().min(1).max(4).nullable().optional(),
    summary: z.string().max(300).nullable().optional(),
    tags: z.array(z.string().max(50)).max(5).optional(),
    title: z.string().max(150).nullable().optional(),
    videoLinks: z.array(z.string().max(2_048)).max(3).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const completeDraftSchema = z
  .object({
    academicPeriod: z.object({ semester: semesterSchema, year: z.number().int() }).strict(),
    category: categorySchema,
    description: z.string().trim().min(1).max(10_000),
    links: z.array(linkSchema).max(5),
    summary: z.string().trim().min(1).max(300),
    tags: z.array(z.string().max(50)).max(5),
    title: z.string().trim().min(1).max(150),
    videoLinks: z.array(z.string().max(2_048)).max(3),
  })
  .strict();

export type SaveWorkDraftActionResult =
  | {
      outcome: 'saved';
      publicId: string;
      savedAt: string;
      version: number;
      work: WorkDraft;
    }
  | {
      error: 'conflict' | 'forbidden' | 'invalid' | 'unauthenticated' | 'unavailable';
      outcome: 'error';
    };

export async function saveWorkDraftAction(input: unknown): Promise<SaveWorkDraftActionResult> {
  const parsed = z
    .object({
      expectedVersion: z.number().int().positive().nullable(),
      idempotencyKey: z.uuid(),
      patch: draftPatchSchema,
      publicId: z.uuid().nullable(),
    })
    .strict()
    .safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.publicId === null) !== (parsed.data.expectedVersion === null)
  ) {
    return actionError('invalid');
  }
  const token = await optionalSessionToken();
  if (token === null) return actionError('unauthenticated');
  try {
    const patch = parsed.data.patch as WorkDraftPatch;
    const result =
      parsed.data.publicId === null
        ? await client().createWork(token, {
            ...patch,
            idempotencyKey: parsed.data.idempotencyKey,
          })
        : await client().patchWork(token, parsed.data.publicId, {
            ...patch,
            expectedVersion: parsed.data.expectedVersion!,
            idempotencyKey: parsed.data.idempotencyKey,
          });
    revalidatePath('/');
    revalidatePath('/works');
    revalidatePath(`/works/${result.work.publicId}`);
    return {
      outcome: 'saved',
      publicId: result.work.publicId,
      savedAt: result.work.savedAt,
      version: result.work.version,
      work: result.work,
    };
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return actionError(mapMutationError(error));
  }
}

export async function searchContributorCandidatesAction(input: unknown) {
  const parsed = z
    .object({ publicId: z.uuid(), query: contributorSearchQuerySchema })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const token = await optionalSessionToken();
  if (token === null) return { error: 'unauthenticated' as const };
  try {
    return {
      candidates: await client().searchContributorCandidates(
        token,
        parsed.data.publicId,
        parsed.data.query,
      ),
    };
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapContributorError(error) };
  }
}

export async function suggestWorkTagsAction(input: unknown) {
  const parsed = z
    .object({ query: z.string().trim().min(2).max(50) })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const, outcome: 'error' as const };
  const token = await optionalSessionToken();
  if (token === null) return { error: 'unauthenticated' as const, outcome: 'error' as const };
  try {
    return {
      outcome: 'success' as const,
      suggestions: await client().suggestTags(token, parsed.data.query),
    };
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: 'unavailable' as const, outcome: 'error' as const };
  }
}

export async function addAccountContributorAction(input: unknown) {
  const parsed = z
    .object({
      candidateReference: z.uuid(),
      contributionRole: z.string().trim().min(1).max(100),
      expectedVersion: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  return contributorMutation(parsed.data, (token) => {
    const { publicId, ...body } = parsed.data;
    return client().addAccountContributor(token, publicId, body);
  });
}

export async function addExternalContributorAction(input: unknown) {
  const parsed = z
    .object({
      attributionName: z.string().trim().min(1).max(100),
      contributionRole: z.string().trim().min(1).max(100),
      expectedVersion: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  return contributorMutation(parsed.data, (token) => {
    const { publicId, ...body } = parsed.data;
    return client().addExternalContributor(token, publicId, body);
  });
}

export async function removeContributorAction(input: unknown) {
  const parsed = z
    .object({
      contributorPublicId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  return contributorMutation(parsed.data, (token) =>
    client().removeContributor(token, parsed.data.publicId, parsed.data.contributorPublicId, {
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    }),
  );
}

export async function uploadWorkMediaAction(input: unknown) {
  const parsed = z
    .object({
      byteSize: z.number().int().positive().max(5_242_880),
      contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      fileExtension: z.enum(['jpeg', 'jpg', 'png', 'webp']),
      idempotencyKey: z.uuid(),
      mediaKind: z.enum(['gallery', 'poster']),
      publicId: z.uuid(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const token = await sessionToken();
  try {
    const { publicId, ...authorization } = parsed.data;
    return await client().authorizeMediaUpload(token, publicId, authorization);
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapMutationError(error) };
  }
}

export async function attachWorkMediaAction(input: unknown) {
  const parsed = z
    .object({
      assetId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      mediaKind: z.enum(['gallery', 'poster']),
      publicId: z.uuid(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const token = await sessionToken();
  try {
    const { publicId, ...body } = parsed.data;
    return await client().attachMedia(token, publicId, body);
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapMutationError(error) };
  }
}

export async function finalizeWorkMediaAction(input: unknown) {
  const parsed = z.object({ assetId: z.uuid(), publicId: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const token = await sessionToken();
  try {
    return await client().finalizeMediaUpload(token, parsed.data.publicId, parsed.data.assetId);
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapMutationError(error) };
  }
}

export async function getWorkMediaStatusAction(input: unknown) {
  const parsed = z.object({ assetId: z.uuid(), publicId: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const token = await sessionToken();
  try {
    return await client().getMediaUploadStatus(token, parsed.data.publicId, parsed.data.assetId);
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapMutationError(error) };
  }
}

export async function submitLatestWorkAction(input: unknown) {
  const parsed = z
    .object({
      draft: completeDraftSchema,
      expectedBasePublishedRevisionId: z.uuid().nullable(),
      expectedDraftVersion: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
      studyYear: z.number().int().min(1).max(4),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const token = await optionalSessionToken();
  if (token === null) return { error: 'unauthenticated' as const };
  try {
    const { publicId, ...submission } = parsed.data;
    const result = await client().submitRevision(token, publicId, {
      ...submission,
      draft: {
        ...submission.draft,
        tags: submission.draft.tags.map((tag) => ({
          displayLabel: tag,
          normalizedIdentity: tag,
        })),
        videoLinks: submission.draft.videoLinks.map((url) => ({
          provider: url.includes('tiktok.com') ? ('tiktok' as const) : ('youtube' as const),
          providerVideoId: url,
          url,
        })),
      },
    });
    revalidatePath('/');
    revalidatePath('/works');
    revalidatePath(`/works/${publicId}`);
    return { outcome: 'submitted' as const, revisionPublicId: result.revision.publicId };
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapSubmissionError(error) };
  }
}

export type SavedDraftActionResult =
  | { error: null; outcome: 'success' }
  | {
      error: 'conflict' | 'invalid' | 'unauthenticated' | 'unavailable';
      outcome: 'error';
    };

export async function archiveSavedDraftAction(input: unknown): Promise<SavedDraftActionResult> {
  const parsed = savedDraftCommand(input, true);
  if (!parsed.success) return { error: 'invalid', outcome: 'error' };
  const token = await sessionToken();
  try {
    await client().archiveSavedDraft(token, parsed.data.publicId, {
      confirmation: true,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapSavedDraftError(error), outcome: 'error' };
  }
  revalidatePath('/');
  revalidatePath('/works');
  return { error: null, outcome: 'success' };
}

export async function restoreSavedDraftAction(input: unknown): Promise<SavedDraftActionResult> {
  const parsed = savedDraftCommand(input, false);
  if (!parsed.success) return { error: 'invalid', outcome: 'error' };
  const token = await sessionToken();
  try {
    await client().restoreSavedDraft(token, parsed.data.publicId, {
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapSavedDraftError(error), outcome: 'error' };
  }
  revalidatePath('/');
  revalidatePath('/works');
  return { error: null, outcome: 'success' };
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
  const token = await sessionToken();
  try {
    await client().withdrawRevision(token, parsed.data.publicId, parsed.data.revisionPublicId, {
      expectedRevisionVersion: parsed.data.expectedRevisionVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
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
    .object({ expectedPublishedRevisionId: z.uuid(), idempotencyKey: z.uuid(), publicId: z.uuid() })
    .safeParse({
      expectedPublishedRevisionId: formData.get('expectedPublishedRevisionId'),
      idempotencyKey: formData.get('idempotencyKey'),
      publicId,
    });
  if (!parsed.success) return revisionFailed(previousState, 'invalid');
  const token = await sessionToken();
  try {
    await client().seedPublishedDraft(token, parsed.data.publicId, {
      expectedPublishedRevisionId: parsed.data.expectedPublishedRevisionId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
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
  const token = await sessionToken();
  try {
    await client().rebaseDraft(token, parsed.data.publicId, {
      expectedPublishedRevisionId: parsed.data.expectedPublishedRevisionId,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return revisionFailed(previousState, mapRevisionError(error));
  }
  revalidatePath(`/works/${parsed.data.publicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

export async function createWorkRemovalRequestAction(
  publicId: string,
  expectedWorkVersion: number,
  previousState: WorkRemovalActionState,
  formData: FormData,
): Promise<WorkRemovalActionState> {
  const parsed = z
    .object({
      expectedWorkVersion: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
      reason: z.string().trim().min(10).max(1_000),
    })
    .safeParse({
      expectedWorkVersion,
      idempotencyKey: formData.get('idempotencyKey'),
      publicId,
      reason: formData.get('reason'),
    });
  if (!parsed.success) return removalFailed(previousState, 'invalid');
  const token = await sessionToken();
  try {
    await client().createRemovalRequest(token, parsed.data.publicId, {
      expectedWorkVersion: parsed.data.expectedWorkVersion,
      idempotencyKey: parsed.data.idempotencyKey,
      reason: parsed.data.reason,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return removalFailed(previousState, mapRemovalError(error));
  }
  revalidatePath(`/works/${parsed.data.publicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

export async function cancelWorkRemovalRequestAction(
  publicId: string,
  requestPublicId: string,
  previousState: WorkRemovalActionState,
  formData: FormData,
): Promise<WorkRemovalActionState> {
  const parsed = z
    .object({
      expectedVersion: z.coerce.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
      requestPublicId: z.uuid(),
    })
    .safeParse({
      expectedVersion: formData.get('expectedVersion'),
      idempotencyKey: formData.get('idempotencyKey'),
      publicId,
      requestPublicId,
    });
  if (!parsed.success) return removalFailed(previousState, 'invalid');
  const token = await sessionToken();
  try {
    await client().cancelRemovalRequest(token, parsed.data.requestPublicId, {
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return removalFailed(previousState, mapRemovalError(error));
  }
  revalidatePath(`/works/${parsed.data.publicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

function client() {
  return new StudentWorksCoreClient(getStudentServerEnvironment());
}

async function optionalSessionToken() {
  return readStudentSessionToken();
}

async function sessionToken(): Promise<string> {
  const token = await optionalSessionToken();
  if (token === null) redirect('/?expired=1');
  return token;
}

function actionError(error: Exclude<SaveWorkDraftActionResult, { outcome: 'saved' }>['error']) {
  return { error, outcome: 'error' as const };
}

function mapMutationError(
  error: unknown,
): Exclude<SaveWorkDraftActionResult, { outcome: 'saved' }>['error'] {
  if (!(error instanceof StudentWorksCoreError)) return 'unavailable';
  if (['WORK_IDEMPOTENCY_CONFLICT', 'WORK_VERSION_CONFLICT'].includes(error.code)) {
    return 'conflict';
  }
  if (['INVALID_REQUEST', 'INVALID_WORK_DRAFT'].includes(error.code)) return 'invalid';
  if (['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)) return 'unauthenticated';
  if (error.code === 'FORBIDDEN' || error.code === 'WORK_AUTHORING_FORBIDDEN') return 'forbidden';
  return 'unavailable';
}

function mapSavedDraftError(
  error: unknown,
): Exclude<SavedDraftActionResult, { outcome: 'success' }>['error'] {
  if (!(error instanceof StudentWorksCoreError)) return 'unavailable';
  if (error.status === 409) return 'conflict';
  if (error.code === 'INVALID_REQUEST') return 'invalid';
  return 'unavailable';
}

async function redirectExpiredSession(error: unknown): Promise<void> {
  if (
    error instanceof StudentWorksCoreError &&
    ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  ) {
    await clearStudentSessionToken();
    redirect('/?expired=1');
  }
}

function mapContributorError(error: unknown) {
  if (!(error instanceof StudentWorksCoreError)) return 'unavailable' as const;
  if (error.code === 'CONTRIBUTOR_LOOKUP_RATE_LIMITED') return 'rate_limited' as const;
  if (error.code === 'WORK_VERSION_CONFLICT') return 'conflict' as const;
  if (['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code))
    return 'unauthenticated' as const;
  if (error.code === 'FORBIDDEN') return 'forbidden' as const;
  if (error.status === 422) return 'invalid' as const;
  return 'unavailable' as const;
}

async function contributorMutation<T extends { publicId: string }>(
  input: T,
  mutation: (token: string) => Promise<{ contributors: WorkContributor[]; version: number }>,
) {
  const token = await optionalSessionToken();
  if (token === null) return { error: 'unauthenticated' as const };
  try {
    const result = await mutation(token);
    revalidatePath(`/works/${input.publicId}`);
    return result;
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return { error: mapContributorError(error) };
  }
}

function mapSubmissionError(error: unknown) {
  if (!(error instanceof StudentWorksCoreError)) return 'unavailable' as const;
  if (error.code === 'WORK_POSTER_REQUIRED') return 'poster' as const;
  if (error.code === 'WORK_MEDIA_NOT_READY') return 'media' as const;
  if (error.code === 'WORK_SUBMISSION_INCOMPLETE') return 'incomplete' as const;
  if (error.code === 'WORK_SUBMITTER_ATTRIBUTION_INVALID') return 'profile' as const;
  if (error.status === 409) return 'conflict' as const;
  if (['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code))
    return 'unauthenticated' as const;
  if (error.code === 'FORBIDDEN') return 'forbidden' as const;
  return error.status === 422 ? ('attribution' as const) : ('unavailable' as const);
}

function savedDraftCommand(input: unknown, confirmation: boolean) {
  return z
    .object({
      confirmation: z.literal(confirmation).optional(),
      expectedVersion: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      publicId: z.uuid(),
    })
    .strict()
    .safeParse(input);
}

function revisionFailed(
  previousState: WorkRevisionActionState,
  error: WorkRevisionActionError,
): WorkRevisionActionState {
  return { ...previousState, error, success: false };
}

function mapRevisionError(error: unknown): WorkRevisionActionError {
  if (!(error instanceof StudentWorksCoreError)) return 'network';
  if (error.status === 409) return 'conflict';
  if (error.code === 'WORK_POSTER_REQUIRED') return 'poster';
  if (error.code === 'WORK_MEDIA_NOT_READY') return 'media';
  if (error.code.includes('ATTRIBUTION')) return 'attribution';
  if (error.code === 'WORK_SUBMISSION_INCOMPLETE') return 'incomplete';
  if (error.code === 'INVALID_REQUEST') return 'invalid';
  return 'network';
}

function removalFailed(
  previousState: WorkRemovalActionState,
  error: WorkRemovalActionError,
): WorkRemovalActionState {
  return { ...previousState, error, success: false };
}

function mapRemovalError(error: unknown): WorkRemovalActionError {
  if (!(error instanceof StudentWorksCoreError)) return 'network';
  if (error.status === 409) return 'conflict';
  if (error.code === 'INVALID_REQUEST') return 'invalid';
  return 'network';
}
