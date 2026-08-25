'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  clearAttributionInvitationSession,
  readAttributionInvitationSession,
  setAttributionInvitationSession,
} from '@/lib/attribution-invitation-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import type { InvitationActionState } from './invitation-action-state';

export async function createAccountInvitationAction(
  publicId: string,
  _previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = z
    .object({ studentId: z.string().regex(/^[0-9]{8}$/) })
    .safeParse({ studentId: formData.get('studentId') });
  if (!parsed.success) return { error: 'invalid', success: false };
  try {
    await client().createAccountInvitation(await requireStudentSession(), publicId, {
      idempotencyKey: randomUUID(),
      studentId: parsed.data.studentId,
    });
    revalidatePath(`/works/${publicId}`);
    return { error: null, success: true };
  } catch {
    return { error: 'unavailable', success: false };
  }
}

export async function createExternalInvitationAction(
  publicId: string,
  _previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = z
    .object({
      affiliation: z.string().trim().max(150),
      attributionName: z.string().trim().min(1).max(100),
      contributionRole: z.string().trim().min(1).max(100),
    })
    .safeParse({
      affiliation: formData.get('affiliation'),
      attributionName: formData.get('attributionName'),
      contributionRole: formData.get('contributionRole'),
    });
  if (!parsed.success) return { error: 'invalid', success: false };
  try {
    const result = await client().createExternalInvitation(
      await requireStudentSession(),
      publicId,
      {
        ...(parsed.data.affiliation.length === 0 ? {} : { affiliation: parsed.data.affiliation }),
        attributionName: parsed.data.attributionName,
        contributionRole: parsed.data.contributionRole,
        idempotencyKey: randomUUID(),
      },
    );
    revalidatePath(`/works/${publicId}`);
    return {
      error: null,
      ...(result.invitationToken === undefined
        ? {}
        : {
            invitationPath: `/contributor-invitations/external#token=${result.invitationToken}`,
          }),
      success: true,
    };
  } catch {
    return { error: 'unavailable', success: false };
  }
}

export async function exchangeExternalInvitationAction(token: string): Promise<never> {
  const parsed = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .safeParse(token);
  if (!parsed.success) redirect('/contributor-invitations/external?error=invalid');
  try {
    const result = await client().exchangeExternalInvitation(
      parsed.data,
      (await readStudentSessionToken()) ?? undefined,
    );
    await setAttributionInvitationSession(result.invitationSessionToken, result.sessionExpiresAt);
  } catch {
    redirect('/contributor-invitations/external?error=invalid');
  }
  redirect('/contributor-invitations/external');
}

export async function revokeInvitationAction(
  publicId: string,
  invitationPublicId: string,
  version: number,
) {
  await client().revokeInvitation(await requireStudentSession(), publicId, invitationPublicId, {
    expectedVersion: version,
    idempotencyKey: randomUUID(),
  });
  revalidatePath(`/works/${publicId}`);
}

export async function respondToAccountInvitationAction(
  invitationPublicId: string,
  version: number,
  _previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const action = formData.get('action');
  if (action !== 'accept' && action !== 'reject' && action !== 'withdraw') {
    return { error: 'invalid', success: false };
  }
  const session = await requireStudentSession();
  try {
    if (action === 'accept') {
      const parsed = z
        .object({
          attributionName: z.string().trim().min(1).max(100),
          consent: z.literal('on'),
          studyYear: z.coerce.number().int().min(1).max(8),
        })
        .safeParse({
          attributionName: formData.get('attributionName'),
          consent: formData.get('consent'),
          studyYear: formData.get('studyYear'),
        });
      if (!parsed.success) return { error: 'invalid', success: false };
      await client().transitionAccountInvitation(session, invitationPublicId, 'accept', {
        attributionName: parsed.data.attributionName,
        consent: true,
        expectedVersion: version,
        idempotencyKey: randomUUID(),
        studyYear: parsed.data.studyYear,
      });
    } else {
      await client().transitionAccountInvitation(session, invitationPublicId, action, {
        expectedVersion: version,
        idempotencyKey: randomUUID(),
      });
    }
    revalidatePath('/contributor-invitations');
    return { error: null, success: true };
  } catch {
    return { error: 'unavailable', success: false };
  }
}

export async function respondToExternalInvitationAction(
  version: number,
  _previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const action = formData.get('action');
  if (action !== 'accept' && action !== 'reject') return { error: 'invalid', success: false };
  const session = await readAttributionInvitationSession();
  if (session === null) return { error: 'unavailable', success: false };
  try {
    if (action === 'reject') {
      await client().transitionExternalInvitation(session, action, {
        expectedVersion: version,
        idempotencyKey: randomUUID(),
      });
      await clearAttributionInvitationSession();
      return { error: null, success: true };
    }
    const parsed = z
      .object({
        affiliation: z.string().trim().max(150),
        attributionName: z.string().trim().min(1).max(100),
        consent: z.literal('on'),
        contributionRole: z.string().trim().min(1).max(100),
      })
      .safeParse({
        affiliation: formData.get('affiliation'),
        attributionName: formData.get('attributionName'),
        consent: formData.get('consent'),
        contributionRole: formData.get('contributionRole'),
      });
    if (!parsed.success) return { error: 'invalid', success: false };
    const result = await client().transitionExternalInvitation(session, 'accept', {
      ...(parsed.data.affiliation.length === 0 ? {} : { affiliation: parsed.data.affiliation }),
      attributionName: parsed.data.attributionName,
      consent: true,
      contributionRole: parsed.data.contributionRole,
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });
    await clearAttributionInvitationSession();
    return {
      error: null,
      ...(result.recoveryCode === undefined ? {} : { recoveryCode: result.recoveryCode }),
      success: true,
    };
  } catch {
    return { error: 'unavailable', success: false };
  }
}

function client() {
  return new StudentWorksCoreClient(getStudentServerEnvironment());
}

async function requireStudentSession() {
  const token = await readStudentSessionToken();
  if (token === null) throw new Error('STUDENT_SESSION_REQUIRED');
  return token;
}
