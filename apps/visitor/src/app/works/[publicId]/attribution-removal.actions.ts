'use server';

import { headers } from 'next/headers';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { getVisitorBffSecret, getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicAttributionRemovalError, PublicWorkCoreClient } from '@/lib/public-work-core';

export type AttributionRemovalActionState = {
  outcome: 'idle' | 'invalid' | 'rate_limited' | 'received' | 'unavailable';
};

export async function requestAttributionRemovalAction(
  workPublicId: string,
  attributionPublicId: string,
  _previous: AttributionRemovalActionState,
  formData: FormData,
): Promise<AttributionRemovalActionState> {
  const requestHeaders = await headers();
  if (!hasSameOrigin(requestHeaders.get('origin'), requestHeaders.get('host')))
    return { outcome: 'invalid' };
  const parsed = z
    .object({
      idempotencyKey: z.uuid(),
      reason: z.string().trim().min(10).max(1_000),
      workPublicId: z.uuid(),
      attributionPublicId: z.uuid(),
    })
    .strict()
    .safeParse({
      attributionPublicId,
      idempotencyKey: formData.get('idempotencyKey'),
      reason: formData.get('reason'),
      workPublicId,
    });
  if (!parsed.success) return { outcome: 'invalid' };
  try {
    const bffSecret = getVisitorBffSecret();
    await new PublicWorkCoreClient(getVisitorCoreUrl()).requestAttributionRemoval(
      parsed.data.workPublicId,
      parsed.data.attributionPublicId,
      { idempotencyKey: parsed.data.idempotencyKey, reason: parsed.data.reason },
      { bffSecret, sourceKey: sourceKey(requestHeaders, bffSecret) },
    );
    return { outcome: 'received' };
  } catch (error: unknown) {
    if (error instanceof PublicAttributionRemovalError && error.status === 429)
      return { outcome: 'rate_limited' };
    if (error instanceof PublicAttributionRemovalError && [404, 422].includes(error.status))
      return { outcome: 'invalid' };
    return { outcome: 'unavailable' };
  }
}

function sourceKey(requestHeaders: Headers, secret: string): string {
  // Coolify's edge proxy appends the connection address. Values to its left are
  // client-controlled and must never select a rate-limit bucket.
  const forwardedChain = requestHeaders
    .get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const source = forwardedChain?.at(-1) ?? 'unknown';
  return createHmac('sha256', secret).update('attribution-removal\0').update(source).digest('hex');
}

function hasSameOrigin(origin: string | null, host: string | null) {
  if (origin === null || host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
