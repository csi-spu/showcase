import 'server-only';
import { cookies } from 'next/headers';

const MAX_AGE_SECONDS = 30 * 60;

function cookieName() {
  return process.env.NODE_ENV === 'production'
    ? '__Host-showcase_attribution_invitation'
    : 'showcase_attribution_invitation';
}

export async function readAttributionInvitationSession(): Promise<string | null> {
  return (await cookies()).get(cookieName())?.value ?? null;
}

export async function setAttributionInvitationSession(token: string, expiresAt: string) {
  (await cookies()).set(cookieName(), token, {
    expires: new Date(expiresAt),
    httpOnly: true,
    maxAge: MAX_AGE_SECONDS,
    path: '/contributor-invitations/external',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearAttributionInvitationSession() {
  (await cookies()).set(cookieName(), '', {
    httpOnly: true,
    maxAge: 0,
    path: '/contributor-invitations/external',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
